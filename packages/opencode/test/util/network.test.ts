import { afterEach, describe, expect, test } from "bun:test"
import { online } from "../../src/util/network"

const value = process.env.COSTRICT_OFFLINE

afterEach(() => {
  if (value === undefined) {
    delete process.env.COSTRICT_OFFLINE
    return
  }
  process.env.COSTRICT_OFFLINE = value
})

describe("util.network", () => {
  test("reports offline when configured", () => {
    process.env.COSTRICT_OFFLINE = "true"
    expect(online()).toBe(false)
  })

  test("accepts numeric offline flag", () => {
    process.env.COSTRICT_OFFLINE = "1"
    expect(online()).toBe(false)
  })
})
