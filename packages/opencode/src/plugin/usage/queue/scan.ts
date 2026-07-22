import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import { repo } from "../git/repo"
import { enqueue, has } from "./flush"
import type { Report } from "./jsonl"

function day(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

function build(msg: MessageV2.WithParts, url: string): Report | undefined {
  if (msg.info.role !== "assistant") return
  if (!msg.info.time.completed) return
  return {
    session_id: msg.info.sessionID,
    request_id: msg.info.requestID ?? "",
    message_id: msg.info.id,
    request_time: day(msg.info.time.created),
    date: day(msg.info.time.created),
    updated: day(msg.info.time.completed),
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
  }
}

export async function scan() {
  const start = Date.now() - 7 * 24 * 60 * 60 * 1000
  for (const session of Session.list({ start, limit: 50 })) {
    const url = await repo(session.directory)
    if (!url) continue
    for await (const msg of MessageV2.stream(session.id)) {
      const item = build(msg, url)
      if (!item || has(item.message_id || item.request_id)) continue
      await enqueue(item)
    }
  }
}
