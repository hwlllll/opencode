import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { Config } from "@/config/config"
import { Global } from "@/global"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, SessionID } from "@/session/schema"
import { Filesystem } from "@/util/filesystem"
import path from "node:path"
import { repo } from "./git/repo"
import { enqueue, flush, FLUSH_INTERVAL } from "./queue/flush"
import { scan } from "./queue/scan"

let timer: Timer | undefined
let exit: (() => void) | undefined

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function formatRFC3339WithOffset(ms: number) {
  const d = new Date(ms)
  const offsetMinutes = -d.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const absOffset = Math.abs(offsetMinutes)
  const offsetHours = Math.floor(absOffset / 60)
  const offsetMins = absOffset % 60
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(offsetHours)}:${pad(offsetMins)}`
}

async function enabled() {
  const cfg = await Config.get()
  return cfg.usage?.report !== false
}

async function ensure() {
  await Filesystem.write(path.join(Global.Path.home, ".dicode", ".keep"), "")
}

async function ingest(msg: MessageV2.WithParts, dir: string) {
  if (msg.info.role !== "assistant") return
  if (!msg.info.time.completed) return
  const url = await repo(dir)
  if (!url) return
  const parent = await MessageV2.get({
    sessionID: SessionID.make(msg.info.sessionID),
    messageID: MessageID.make(msg.info.parentID),
  }).catch(() => undefined)
  const request = parent?.info.role === "user" ? formatRFC3339WithOffset(parent.info.time.created) : formatRFC3339WithOffset(msg.info.time.created)
  const ok = await enqueue({
    session_id: msg.info.sessionID,
    request_id: msg.info.requestID ?? "",
    message_id: msg.info.id,
    request_time: request,
    date: formatRFC3339WithOffset(msg.info.time.created),
    updated: formatRFC3339WithOffset(msg.info.time.completed),
    model_id: msg.info.modelID,
    provider_id: msg.info.providerID,
    input_tokens: msg.info.tokens.input,
    output_tokens: msg.info.tokens.output,
    reasoning_tokens: msg.info.tokens.reasoning,
    cache_read_tokens: msg.info.tokens.cache.read,
    cache_write_tokens: msg.info.tokens.cache.write,
    cost: msg.info.cost,
    rounds: 1,
    git_repo_url: url,
    git_worktree: "",
    queued_at: Date.now(),
    retry_count: 0,
  })
  if (!ok.ok) return
  if (ok.flush) await flush()
}

export async function UsagePlugin(input: PluginInput): Promise<Hooks> {
  if (!(await enabled())) return {}
  await ensure()
  if (timer) clearInterval(timer)
  if (exit) process.off("beforeExit", exit)
  timer = setInterval(() => void flush(), FLUSH_INTERVAL)
  exit = () => {
    if (timer) clearInterval(timer)
    void flush()
  }
  process.on("beforeExit", exit)
  await scan()
  return {
    event: async (evt) => {
      if (!(await enabled())) return
      if (evt.event.type !== MessageV2.Event.Updated.type) return
      if (evt.event.properties.info.role !== "assistant") return
      const msg = await MessageV2.get({
        sessionID: SessionID.make(evt.event.properties.info.sessionID),
        messageID: MessageID.make(evt.event.properties.info.id),
      })
      await ingest(msg, input.worktree)
    },
  }
}
