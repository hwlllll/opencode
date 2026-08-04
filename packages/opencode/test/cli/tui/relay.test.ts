import { describe, expect, test } from "bun:test"
import { relay } from "../../../src/cli/cmd/tui/util/relay"

describe("tui event relay", () => {
  test("does not subscribe after cancellation", async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    let opens = 0

    const result = await relay({
      signal: ctrl.signal,
      active: () => true,
      open: () => {
        opens++
        return () => {}
      },
      event: () => false,
    })

    expect(result).toBe(false)
    expect(opens).toBe(0)
  })

  test("stale relay does not forward events", async () => {
    const ctrl = new AbortController()
    let active = true
    let handler = (_event: string) => {}
    let events = 0
    let closes = 0

    const result = relay({
      signal: ctrl.signal,
      active: () => active,
      open: (next) => {
        handler = next
        return () => closes++
      },
      event: () => {
        events++
        return false
      },
    })

    active = false
    handler("delta")
    ctrl.abort()

    expect(await result).toBe(false)
    expect(events).toBe(0)
    expect(closes).toBe(1)
  })

  test("closes before resolving a reconnect event", async () => {
    const ctrl = new AbortController()
    let handler = (_event: string) => {}
    let closes = 0

    const result = relay({
      signal: ctrl.signal,
      active: () => true,
      open: (next) => {
        handler = next
        return () => closes++
      },
      event: (event) => event === "disposed",
    })

    handler("disposed")

    expect(await result).toBe(true)
    expect(closes).toBe(1)
  })

  test("closes a synchronous reconnect subscription", async () => {
    const ctrl = new AbortController()
    let closes = 0

    const result = relay({
      signal: ctrl.signal,
      active: () => true,
      open: (handler) => {
        handler("disposed")
        return () => closes++
      },
      event: () => true,
    })

    expect(await result).toBe(true)
    expect(closes).toBe(1)
  })
})
