import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../../fixture/fixture"

type Report = import("../../../src/plugin/usage/queue/jsonl").Report

const pushMock = mock(async (_items: Report[]) => ({ accepted: 0 }))

mock.module("../../../src/plugin/usage/report/push", () => ({
  push: pushMock,
}))

const { enqueue, flush } = await import("../../../src/plugin/usage/queue/flush")
const { file, inflight, read, readInflight, writeInflight } = await import("../../../src/plugin/usage/queue/jsonl")

function item(id: string, retry = 0): Report {
  return {
    session_id: "s",
    request_id: "",
    message_id: id,
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
    retry_count: retry,
  }
}

describe("plugin.usage.queue", () => {
  let tmp: Awaited<ReturnType<typeof tmpdir>> | undefined
  let home = ""
  let prev = ""

  beforeEach(async () => {
    pushMock.mockReset()
    tmp = await tmpdir()
    home = tmp.path
    prev = process.env.COSTRICT_TEST_HOME || ""
    process.env.COSTRICT_TEST_HOME = home
    await fs.mkdir(path.join(home, ".costrict"), { recursive: true })
  })

  afterEach(async () => {
    if (prev) process.env.COSTRICT_TEST_HOME = prev
    else delete process.env.COSTRICT_TEST_HOME
    await tmp?.[Symbol.asyncDispose]()
  })

  test("dedupes concurrent enqueue under lock", async () => {
    const input = item("dup")
    const out = await Promise.all(Array.from({ length: 10 }, () => enqueue(input)))
    expect(out.filter((x) => x.ok).length).toBe(1)
    expect((await read()).map((x) => x.message_id)).toEqual(["dup"])
  })

  test("flush claims batch, pushes outside lock, and acks inflight", async () => {
    await Promise.all([enqueue(item("a")), enqueue(item("b"))])
    let seenQueue = [] as Report[]
    let seenInflight = [] as Report[]
    pushMock.mockImplementationOnce(async (items: Report[]) => {
      seenQueue = await read()
      seenInflight = await readInflight()
      expect(items.map((x) => x.message_id).sort()).toEqual(["a", "b"])
      return { accepted: items.length }
    })

    await flush()

    expect(seenQueue).toEqual([])
    expect(seenInflight.map((x) => x.message_id).sort()).toEqual(["a", "b"])
    expect(await read()).toEqual([])
    expect(await readInflight()).toEqual([])
  })

  test("failed flush returns batch to queue with retry increment", async () => {
    await enqueue(item("retry"))
    pushMock.mockImplementationOnce(async () => {
      throw new Error("boom")
    })

    await flush()

    const list = await read()
    expect(list).toHaveLength(1)
    expect(list[0].message_id).toBe("retry")
    expect(list[0].retry_count).toBe(1)
    expect(await readInflight()).toEqual([])
  })

  test("recovers expired inflight items before enqueue", async () => {
    await writeInflight([{ ...item("stale", 1), lease_until: Date.now() - 1 }])

    const out = await enqueue(item("fresh"))

    expect(out.ok).toBe(true)
    expect((await read()).map((x) => x.message_id)).toEqual(["stale", "fresh"])
    expect(await readInflight()).toEqual([])
  })

  test("drops items that exceed max retries after failed push", async () => {
    await fs.writeFile(file(), `${JSON.stringify(item("max", 2))}\n`)
    await fs.writeFile(inflight(), "")
    pushMock.mockImplementationOnce(async () => {
      throw new Error("boom")
    })

    await flush()

    expect(await read()).toEqual([])
    expect(await readInflight()).toEqual([])
  })
})
