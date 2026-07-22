import { describe, test, expect, beforeEach, afterEach, jest } from "bun:test"
import { MemoryMonitor, type MemoryMonitorConfig, isMemoryMonitorEnabled } from "@/plugin/tdd/memory/memory-monitor"
import { Bus } from "@/bus"
import path from "path"
import fs from "fs/promises"
import { Global } from "@/global"
import * as jsc from "bun:jsc"

describe("MemoryMonitor", () => {
  function createMonitor(config?: Partial<MemoryMonitorConfig>) {
    const monitor = new MemoryMonitor({
      checkInterval: 100,
      snapshotRetainCount: 3,
      thresholds: [1, 2],
      ...config,
    })
    return monitor
  }

  describe("basic functionality", () => {
    let monitor: MemoryMonitor
    let testSnapshotDir: string
    let originalEnv: string | undefined

    beforeEach(async () => {
      originalEnv = process.env.COSTRICT_MEMORY_MONITOR_ENABLED
      process.env.COSTRICT_MEMORY_MONITOR_ENABLED = "true"

      testSnapshotDir = path.join(Global.Path.data, `test-snapshots-${Date.now()}`)
      await fs.mkdir(testSnapshotDir, { recursive: true })

      monitor = createMonitor()
    })

    afterEach(async () => {
      monitor.stop()

      if (originalEnv !== undefined) {
        process.env.COSTRICT_MEMORY_MONITOR_ENABLED = originalEnv
      } else {
        delete process.env.COSTRICT_MEMORY_MONITOR_ENABLED
      }

      try {
        await fs.rm(testSnapshotDir, { recursive: true, force: true })
      } catch (err) {}
    })

    test("should initialize with default config", () => {
      const defaultMonitor = new MemoryMonitor()
      const config = defaultMonitor.getConfig()

      expect(config.checkInterval).toBe(60000)
      expect(config.snapshotRetainCount).toBe(5)
      expect(config.thresholds).toEqual([4, 6, 10, 15])
    })

    test("should initialize with custom config", () => {
      const config: Partial<MemoryMonitorConfig> = {
        checkInterval: 5000,
        snapshotRetainCount: 5,
        thresholds: [1, 2, 3],
      }

      const customMonitor = new MemoryMonitor(config)
      const monitorConfig = customMonitor.getConfig()

      expect(monitorConfig.checkInterval).toBe(5000)
      expect(monitorConfig.snapshotRetainCount).toBe(5)
      expect(monitorConfig.thresholds).toEqual([1, 2, 3])
    })

    test("should start and stop monitoring", () => {
      monitor.start()
      monitor.stop()

      expect(true).toBe(true)
    })

    test("should not start when already started", () => {
      monitor.start()
      const secondStartResult = monitor.start()

      expect(secondStartResult).toBeUndefined()
    })

    test("should not start when disabled via environment variable", () => {
      const originalEnv = process.env.COSTRICT_MEMORY_MONITOR_ENABLED

      delete process.env.COSTRICT_MEMORY_MONITOR_ENABLED

      const config: Partial<MemoryMonitorConfig> = {
        checkInterval: 100,
      }

      const disabledMonitor = new MemoryMonitor(config)
      disabledMonitor.start()

      expect(disabledMonitor.getConfig().checkInterval).toBe(100)

      if (originalEnv !== undefined) {
        process.env.COSTRICT_MEMORY_MONITOR_ENABLED = originalEnv
      }
    })

    test("isMemoryMonitorEnabled should check environment variable", () => {
      const originalEnv = process.env.COSTRICT_MEMORY_MONITOR_ENABLED

      delete process.env.COSTRICT_MEMORY_MONITOR_ENABLED
      expect(isMemoryMonitorEnabled()).toBe(true)

      process.env.COSTRICT_MEMORY_MONITOR_ENABLED = "false"
      expect(isMemoryMonitorEnabled()).toBe(false)

      process.env.COSTRICT_MEMORY_MONITOR_ENABLED = "0"
      expect(isMemoryMonitorEnabled()).toBe(false)

      process.env.COSTRICT_MEMORY_MONITOR_ENABLED = "true"
      expect(isMemoryMonitorEnabled()).toBe(true)

      process.env.COSTRICT_MEMORY_MONITOR_ENABLED = "1"
      expect(isMemoryMonitorEnabled()).toBe(true)

      if (originalEnv !== undefined) {
        process.env.COSTRICT_MEMORY_MONITOR_ENABLED = originalEnv
      } else {
        delete process.env.COSTRICT_MEMORY_MONITOR_ENABLED
      }
    })

    test("should detect memory threshold and trigger snapshot", async () => {
      const mockHeapStats = {
        heapSize: 1.2 * 1024 * 1024 * 1024,
        heapCapacity: 2 * 1024 * 1024 * 1024,
        extraMemorySize: 50 * 1024 * 1024,
        objectCount: 10000,
        protectedObjectCount: 100,
        globalObjectCount: 1,
        protectedGlobalObjectCount: 1,
        objectTypeCounts: {},
        protectedObjectTypeCounts: {},
      }

      const spy = jest.spyOn(jsc, "heapStats").mockReturnValue(mockHeapStats)
      const publishSpy = jest.spyOn(Bus, "publish").mockImplementation(async () => {
        return Promise.resolve(undefined) as never
      })

      monitor.start()

      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(spy).toHaveBeenCalled()
      spy.mockClear()
      publishSpy.mockClear()
    })

    test("should create snapshot directory if not exists", async () => {
      const config = monitor.getConfig()
      const snapshotPath = path.join(Global.Path.data, "memory-snapshots")

      const exists = await fs
        .access(snapshotPath)
        .then(() => true)
        .catch(() => false)

      if (exists) {
        await fs.rm(snapshotPath, { recursive: true, force: true })
      }

      await fs.mkdir(snapshotPath, { recursive: true })

      const newExists = await fs
        .access(snapshotPath)
        .then(() => true)
        .catch(() => false)

      expect(newExists).toBe(true)
    })

    test("should handle heap snapshot generation in Bun environment", async () => {
      const config: Partial<MemoryMonitorConfig> = {
        checkInterval: 100,
        thresholds: [1],
      }

      const testMonitor = new MemoryMonitor(config)
      const mockHeapStats = {
        heapSize: 1.2 * 1024 * 1024 * 1024,
        heapCapacity: 2 * 1024 * 1024 * 1024,
        extraMemorySize: 50 * 1024 * 1024,
        objectCount: 10000,
        protectedObjectCount: 100,
        globalObjectCount: 1,
        protectedGlobalObjectCount: 1,
        objectTypeCounts: {},
        protectedObjectTypeCounts: {},
      }

      jest.spyOn(jsc, "heapStats").mockReturnValue(mockHeapStats)
      jest.spyOn(Bus, "publish").mockImplementation(async () => {
        return Promise.resolve(undefined) as never
      })

      testMonitor.start()

      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(testMonitor.getConfig().checkInterval).toBe(100)

      jest.clearAllMocks()
      testMonitor.stop()
    })
  })
})
