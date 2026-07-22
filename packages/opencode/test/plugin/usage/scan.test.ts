import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../../fixture/fixture"

type Msg = {
  info: {
    role: string
    sessionID: string
    requestID?: string
    id: string
    time: { created: number; completed?: number }
    modelID: string
    providerID: string
    tokens: {
      input: number
      output: number
      reasoning: number
      cache: { read: number; write: number }
    }
    cost: number
  }
}

const sessions = mock(() => [] as Array<{ id: string; directory: string }>)
const stream = mock((_id: string) => iter<Msg>([]))
const repo = mock(async (_dir: string) => "https://example.com/repo.git")

mock.module("@/session", () => ({
  Session: {
    list: sessions,
  },
}))

mock.module("@/session/message-v2", () => ({
  MessageV2: {
    stream,
  },
}))

mock.module("../../../src/plugin/usage/git/repo", () => ({
  repo,
}))

const { enqueue } = await import("../../../src/plugin/usage/queue/flush")
const { read } = await import("../../../src/plugin/usage/queue/jsonl")
const { scan } = await import("../../../src/plugin/usage/queue/scan")

function iter<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item
    },
  }
}

function msg(id: string, input: Partial<Msg["info"]> = {}): Msg {
  return {
    info: {
      role: "assistant",
      sessionID: "s-1",
      requestID: "",
      id,
      time: { created: Date.now(), completed: Date.now() },
      modelID: "m",
      providerID: "p",
      tokens: {
        input: 1,
        output: 2,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      cost: 0,
      ...input,
    },
  }
}

describe("plugin.usage.scan", () => {
  let tmp: Awaited<ReturnType<typeof tmpdir>> | undefined
  let prev = ""

  beforeEach(async () => {
    tmp = await tmpdir()
    prev = process.env.COSTRICT_TEST_HOME || ""
    process.env.COSTRICT_TEST_HOME = tmp.path
    await fs.mkdir(path.join(tmp.path, ".costrict"), { recursive: true })
    sessions.mockReset()
    stream.mockReset()
    repo.mockReset()
    repo.mockImplementation(async () => "https://example.com/repo.git")
  })

  afterEach(async () => {
    if (prev) process.env.COSTRICT_TEST_HOME = prev
    else delete process.env.COSTRICT_TEST_HOME
    await tmp?.[Symbol.asyncDispose]()
  })

  test("historical scan backfills eligible assistant messages only", async () => {
    sessions.mockImplementation(() => [{ id: "s-1", directory: "/repo" }])
    stream.mockImplementation(() =>
      iter([
        msg("ok-1"),
        msg("skip-role", { role: "user" }),
        msg("skip-completed", { time: { created: Date.now(), completed: undefined } }),
        msg("ok-2", { requestID: "req-2" }),
      ]),
    )

    await scan()

    const list = await read()
    expect(list.map((x) => x.message_id)).toEqual(["ok-1", "ok-2"])
    expect(list.map((x) => x.request_time)).toEqual(list.map((x) => x.date))
  })

  test("historical scan does not duplicate records across repeated runs", async () => {
    sessions.mockImplementation(() => [{ id: "s-1", directory: "/repo" }])
    stream.mockImplementation(() => iter([msg("dup-1"), msg("dup-2")]))

    await scan()
    await scan()

    const list = await read()
    expect(list.map((x) => x.message_id)).toEqual(["dup-1", "dup-2"])
  })

  test("historical scan skips sessions without repo and existing queued ids", async () => {
    await enqueue({
      session_id: "s-1",
      request_id: "",
      message_id: "existing",
      date: "2025-01-01",
      updated: "2025-01-01",
      model_id: "m",
      provider_id: "p",
      input_tokens: 1,
      output_tokens: 1,
      reasoning_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost: 0,
      rounds: 1,
      git_repo_url: "https://example.com/repo.git",
      git_worktree: "",
      queued_at: Date.now(),
      retry_count: 0,
    })

    sessions.mockImplementation(() => [
      { id: "s-1", directory: "/repo-a" },
      { id: "s-2", directory: "/repo-b" },
    ])
    repo.mockImplementation(async (dir: string) => (dir === "/repo-a" ? "https://example.com/repo.git" : ""))
    stream.mockImplementation((id: string) => iter(id === "s-1" ? [msg("existing"), msg("new")] : [msg("ignored")]))

    await scan()

    const list = await read()
    expect(list.map((x) => x.message_id)).toEqual(["existing", "new"])
    expect(list.map((x) => x.request_time)).toEqual([undefined, list[1].date])
  })
})
