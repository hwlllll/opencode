import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"
import path from "node:path"

export function file() {
  return path.join(Global.Path.home, ".dicode", "usage-queue.jsonl")
}

export function inflight() {
  return path.join(Global.Path.home, ".dicode", "usage-inflight.jsonl")
}

export type Report = {
  session_id: string
  request_id: string
  message_id: string
  request_time?: string
  date: string
  updated: string
  model_id: string
  provider_id: string
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost: number
  rounds: number
  git_repo_url: string
  git_worktree: string
  queued_at: number
  retry_count: number
  lease_until?: number
}

export function key(item: Pick<Report, "message_id" | "request_id">) {
  return item.message_id || item.request_id
}

async function load(target: string) {
  if (!(await Filesystem.exists(target))) return [] as Report[]
  return (await Filesystem.readText(target))
    .split(/\r?\n/)
    .flatMap((line) => {
      if (!line.trim()) return []
      try {
        return [JSON.parse(line) as Report]
      } catch {
        return []
      }
    })
}

export async function read() {
  return load(file())
}

export async function readInflight() {
  return load(inflight())
}

async function save(target: string, items: Report[]) {
  const text = items.map((item) => JSON.stringify(item)).join("\n")
  await Filesystem.write(target, text ? text + "\n" : "")
}

export async function write(items: Report[]) {
  await save(file(), items)
}

export async function writeInflight(items: Report[]) {
  await save(inflight(), items)
}

export async function append(item: Report) {
  const list = await read()
  const id = key(item)
  if (!id) return false
  if (list.some((x) => key(x) === id)) return false
  list.push(item)
  await write(list)
  return true
}
