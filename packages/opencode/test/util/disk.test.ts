import { test, expect, describe } from "bun:test"
import { Disk } from "../../src/util/disk"
import { tmpdir } from "../fixture/fixture"
import { $ } from "bun"
import { Log } from "../../src/util/log"
import fs from "fs/promises"

const log = Log.create({ service: "test" })

describe("Disk", () => {
  test("formatBytes should format bytes correctly", () => {
    expect(Disk.formatBytes(1024)).toBe("0.00 MB")
    expect(Disk.formatBytes(1024 * 1024)).toBe("1.00 MB")
    expect(Disk.formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB")
    expect(Disk.formatBytes(1024 * 1024 * 1024 * 1.5)).toBe("1.50 GB")
    expect(Disk.formatBytes(500 * 1024 * 1024)).toBe("500.00 MB")
  })

  test("getDiskSpace should return disk space info", async () => {
    const tmp = await tmpdir({})
    const space = await Disk.getDiskSpace(tmp.path)

    expect(space).toBeDefined()
    expect(space.free).toBeGreaterThan(0)
    expect(space.total).toBeGreaterThan(0)
    expect(space.used).toBeGreaterThanOrEqual(0)
    expect(space.free + space.used).toBe(space.total)
  })

  test("checkDiskSpace should check against threshold", async () => {
    const tmp = await tmpdir({})
    const space = await Disk.getDiskSpace(tmp.path)

    const result1 = await Disk.checkDiskSpace(tmp.path, "1KB")

    expect(result1).toBeDefined()
    expect(result1.hasEnoughSpace).toBe(true)
    expect(result1.free).toBeGreaterThan(0)
    expect(result1.threshold).toBe(1024)
    expect(result1.path).toBe(tmp.path)

    const result2 = await Disk.checkDiskSpace(tmp.path, space.total * 2)

    expect(result2.hasEnoughSpace).toBe(false)
    expect(result2.free).toBeLessThan(result2.threshold)
  })

  test("checkDiskSpace should handle numeric threshold", async () => {
    const tmp = await tmpdir({})
    const threshold = 1024 * 1024
    const result = await Disk.checkDiskSpace(tmp.path, threshold)

    expect(result).toBeDefined()
    expect(result.hasEnoughSpace).toBe(true)
    expect(result.threshold).toBe(threshold)
  })

  test("checkDiskSpace should handle different size formats", async () => {
    const tmp = await tmpdir({})

    const result1 = await Disk.checkDiskSpace(tmp.path, "1GB")
    expect(result1.threshold).toBe(1024 * 1024 * 1024)

    const result2 = await Disk.checkDiskSpace(tmp.path, "500MB")
    expect(result2.threshold).toBe(500 * 1024 * 1024)

    const result3 = await Disk.checkDiskSpace(tmp.path, "1G")
    expect(result3.threshold).toBe(1024 * 1024 * 1024)

    const result4 = await Disk.checkDiskSpace(tmp.path, "1M")
    expect(result4.threshold).toBe(1024 * 1024)
  })

  test("checkDiskSpace should handle invalid path gracefully", async () => {
    const result = await Disk.checkDiskSpace("/non/existent/path", "1GB")

    expect(result.hasEnoughSpace).toBe(false)
    expect(result.free).toBe(0)
  })

  test("cross-platform disk space check", async () => {
    const tmp = await tmpdir({})
    const space = await Disk.getDiskSpace(tmp.path)

    expect(space).toBeDefined()
    expect(space.free).toBeGreaterThan(0)
    expect(space.total).toBeGreaterThan(space.free)

    log.info("Disk space check successful", {
      platform: process.platform,
      free: Disk.formatBytes(space.free),
      total: Disk.formatBytes(space.total),
      used: Disk.formatBytes(space.used),
    })
  })
})
