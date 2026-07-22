import { Flock } from "@/util/flock"
import { Log } from "@/util/log"
import { append, key, read, readInflight, write, writeInflight, type Report } from "./jsonl"
import { push } from "../report/push"

const log = Log.create({ service: "usage.flush" })

export const BATCH_SIZE = 50
export const MAX_RETRIES = 3
export const FLUSH_INTERVAL = 300_000
export const LEASE_MS = 5 * 60_000

const LOCK_KEY = "costrict:usage-queue"

let busy = false
const sent = new Set<string>()

export type EnqueueResult = {
  ok: boolean
  flush: boolean
}

export function has(id: string) {
  return sent.has(id)
}

function done(items: Report[]) {
  return new Set(items.map((item) => key(item)).filter(Boolean))
}

function expired(item: Report, now: number) {
  return !!item.lease_until && item.lease_until <= now
}

async function recover(now: number) {
  const inflight = await readInflight()
  if (inflight.length === 0) return
  const stale = inflight.filter((item) => expired(item, now))
  if (stale.length === 0) return
  const keep = inflight.filter((item) => !expired(item, now))
  const list = await read()
  const seen = new Set(list.map((item) => key(item)).filter(Boolean))
  const next = stale.flatMap((item) => {
    const id = key(item)
    if (!id || seen.has(id)) return []
    seen.add(id)
    return [{ ...item, lease_until: undefined }]
  })
  await write([...list, ...next])
  await writeInflight(keep)
}

async function claim(now: number) {
  return Flock.withLock(LOCK_KEY, async () => {
    await recover(now)
    const list = await read()
    const batch = list.filter((item) => item.retry_count < MAX_RETRIES).slice(0, BATCH_SIZE)
    if (batch.length === 0) return [] as Report[]
    const ids = done(batch)
    const lease = now + LEASE_MS
    const inflight = await readInflight()
    await write(list.filter((item) => !ids.has(key(item))))
    await writeInflight([...inflight, ...batch.map((item) => ({ ...item, lease_until: lease }))])
    return batch
  })
}

async function ack(batch: Report[]) {
  if (batch.length === 0) return
  const ids = done(batch)
  await Flock.withLock(LOCK_KEY, async () => {
    const inflight = await readInflight()
    await writeInflight(inflight.filter((item) => !ids.has(key(item))))
  })
}

async function fail(batch: Report[]) {
  if (batch.length === 0) return
  const ids = done(batch)
  await Flock.withLock(LOCK_KEY, async () => {
    const inflight = await readInflight()
    const retry = inflight.flatMap((item) => {
      if (!ids.has(key(item))) return []
      return item.retry_count + 1 >= MAX_RETRIES ? [] : [{ ...item, retry_count: item.retry_count + 1, lease_until: undefined }]
    })
    const keep = inflight.filter((item) => !ids.has(key(item)))
    const list = await read()
    const seen = new Set(list.map((item) => key(item)).filter(Boolean))
    const next = retry.flatMap((item) => {
      const id = key(item)
      if (!id || seen.has(id)) return []
      seen.add(id)
      return [item]
    })
    await write([...list, ...next])
    await writeInflight(keep)
  })
}

export async function enqueue(item: Report): Promise<EnqueueResult> {
  return Flock.withLock(LOCK_KEY, async () => {
    const id = key(item)
    if (!id || sent.has(id)) return { ok: false, flush: false }
    await recover(Date.now())
    const ok = await append(item)
    if (!ok) return { ok: false, flush: false }
    sent.add(id)
    const list = await read()
    return { ok, flush: list.length >= BATCH_SIZE }
  })
}

export async function flush() {
  if (busy) return
  busy = true
  try {
    const batch = await claim(Date.now())
    if (batch.length === 0) return
    try {
      await push(batch)
      await ack(batch)
    } catch (err) {
      log.warn("usage flush failed", { err })
      await fail(batch)
    }
  } finally {
    busy = false
  }
}
