import { describe, it, expect, beforeEach } from "bun:test"
import { Log } from "@/util/log"
import fs from "fs/promises"
import path from "path"
import { Global } from "@/global"

describe("Log", () => {
  describe("create", () => {
    it("should create a logger with default tags", () => {
      const logger = Log.create()
      expect(logger).toBeDefined()
      expect(logger.debug).toBeFunction()
      expect(logger.info).toBeFunction()
      expect(logger.warn).toBeFunction()
      expect(logger.error).toBeFunction()
      expect(logger.tag).toBeFunction()
      expect(logger.clone).toBeFunction()
      expect(logger.time).toBeFunction()
    })

    it("should create a logger with service tag", () => {
      const logger = Log.create({ service: "test-service" })
      expect(logger).toBeDefined()
      const logger2 = Log.create({ service: "test-service" })
      expect(logger2).toBe(logger)
    })

    it("should return cached logger for same service", () => {
      const logger1 = Log.create({ service: "same-service" })
      const logger2 = Log.create({ service: "same-service" })
      expect(logger1).toBe(logger2)
    })

    it("should create different loggers for different services", () => {
      const logger1 = Log.create({ service: "service-a" })
      const logger2 = Log.create({ service: "service-b" })
      expect(logger1).not.toBe(logger2)
    })

    it("should create logger with custom tags", () => {
      const logger = Log.create({ service: "custom", customTag: "value" })
      expect(logger).toBeDefined()
    })
  })

  describe("tag", () => {
    it("should add tag to logger", () => {
      const logger = Log.create({ service: "tag-test" })
      const taggedLogger = logger.tag("custom-key", "custom-value")
      expect(taggedLogger).toBe(logger)
    })

    it("should add multiple tags", () => {
      const logger = Log.create({ service: "tag-test" })
      logger.tag("key1", "value1").tag("key2", "value2")
    })

    it("should be chainable", () => {
      const logger = Log.create({ service: "tag-test" })
      const result = logger.tag("key1", "value1").tag("key2", "value2")
      expect(result).toBe(logger)
    })
  })

  describe("clone", () => {
    beforeEach(async () => {
      await Log.init({ print: false, dev: true, level: "DEBUG" })
    })

    it("should create a copy of logger", () => {
      const logger1 = Log.create({ service: "clone-test", tag1: "value1" })
      const logger2 = logger1.clone()

      expect(logger2).toBeDefined()
      expect(logger2.debug).toBeFunction()
      expect(logger2.info).toBeFunction()
      expect(logger2.warn).toBeFunction()
      expect(logger2.error).toBeFunction()
      expect(logger2.tag).toBeFunction()
      expect(logger2.clone).toBeFunction()
      expect(logger2.time).toBeFunction()
    })

    it("should create independent clone that can be modified", () => {
      const logger1 = Log.create({ service: "clone-test", tag1: "value1" })
      const logger2 = logger1.clone().tag("tag2", "value2")

      expect(logger2).toBeDefined()
    })

    it("should verify isolation between clones - tags should not affect each other", async () => {
      const logger1 = Log.create({ service: "clone-isolation-test", tag1: "original" })
      const logger2 = logger1.clone()
      const logger3 = logger1.clone()

      logger2.tag("cloned2", "value2")
      logger3.tag("cloned3", "value3")

      const captured: string[] = []

      const originalWrite = process.stderr.write
      process.stderr.write = ((msg: any) => {
        captured.push(msg.toString())
      }) as any

      const logPath = Log.file()
      await fs.writeFile(logPath, "", "utf-8")

      logger1.info("message from original")
      logger2.info("message from clone2")
      logger3.info("message from clone3")

      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("tag1=original")
      expect(content).toContain("cloned2=value2")
      expect(content).toContain("cloned3=value3")

      process.stderr.write = originalWrite
    })

    it("should verify same tag key modifications don't affect each other", async () => {
      const base = Log.create({ service: "same-key-test", common: "initial" })
      const clone1 = base.clone()
      const clone2 = base.clone()

      const logPath = Log.file()
      await fs.writeFile(logPath, "", "utf-8")

      base.info("base message")
      clone1.tag("common", "value1").info("clone1 message")
      clone2.tag("common", "value2").info("clone2 message")

      const content = await fs.readFile(logPath, "utf-8")
      const lines = content.split("\n").filter((line) => line.length > 0)

      const baseLine = lines.find((l) => l.includes("base message"))
      const clone1Line = lines.find((l) => l.includes("clone1 message"))
      const clone2Line = lines.find((l) => l.includes("clone2 message"))

      expect(baseLine).toBeDefined()
      expect(baseLine).toContain("common=initial")
      expect(baseLine).not.toContain("value1")
      expect(baseLine).not.toContain("value2")

      expect(clone1Line).toBeDefined()
      expect(clone1Line).toContain("common=value1")
      expect(clone1Line).not.toContain("value2")

      expect(clone2Line).toBeDefined()
      expect(clone2Line).toContain("common=value2")
      expect(clone2Line).not.toContain("value1")
    })

    it("should verify clone creates independent instances", async () => {
      const originalLogger = Log.create({ service: "independence-test", baseTag: "base" })
      const clone1 = originalLogger.clone()
      const clone2 = originalLogger.clone()

      expect(originalLogger).not.toBe(clone1)
      expect(originalLogger).not.toBe(clone2)
      expect(clone1).not.toBe(clone2)

      const logPath = Log.file()
      await fs.writeFile(logPath, "", "utf-8")

      originalLogger.info("original message")
      clone1.tag("clone1-tag", "clone1-value").info("clone1 message")
      clone2.tag("clone2-tag", "clone2-value").info("clone2 message")

      const content = await fs.readFile(logPath, "utf-8")
      const lines = content.split("\n").filter((line) => line.length > 0)

      expect(content).toContain("baseTag=base")
      expect(content).toContain("original message")
      expect(content).toContain("clone1 message")
      expect(content).toContain("clone2 message")

      const originalLine = lines.find((l) => l.includes("original message"))
      const clone1Line = lines.find((l) => l.includes("clone1 message"))
      const clone2Line = lines.find((l) => l.includes("clone2 message"))

      expect(originalLine).toBeDefined()
      expect(originalLine).toContain("baseTag=base")
      expect(originalLine).not.toContain("clone1-tag")
      expect(originalLine).not.toContain("clone2-tag")

      expect(clone1Line).toBeDefined()
      expect(clone1Line).toContain("baseTag=base")
      expect(clone1Line).toContain("clone1-tag=clone1-value")
      expect(clone1Line).not.toContain("clone2-tag")

      expect(clone2Line).toBeDefined()
      expect(clone2Line).toContain("baseTag=base")
      expect(clone2Line).toContain("clone2-tag=clone2-value")
      expect(clone2Line).not.toContain("clone1-tag")
    })

    it("should verify deep isolation - chained tags", async () => {
      const base = Log.create({ service: "deep-isolation", id: "base" })
      const level1 = base.clone().tag("level1", "v1")
      const level2 = level1.clone().tag("level2", "v2")
      const level3 = level2.clone().tag("level3", "v3")

      const logPath = Log.file()
      await fs.writeFile(logPath, "", "utf-8")

      base.info("base msg")
      level1.info("level1 msg")
      level2.info("level2 msg")
      level3.info("level3 msg")

      const content = await fs.readFile(logPath, "utf-8")

      const lines = content.split("\n").filter((line) => line.length > 0)
      const baseLine = lines.find((l) => l.includes("base msg"))
      const level1Line = lines.find((l) => l.includes("level1 msg"))
      const level2Line = lines.find((l) => l.includes("level2 msg"))
      const level3Line = lines.find((l) => l.includes("level3 msg"))

      expect(baseLine).toBeDefined()
      expect(baseLine).toContain("id=base")
      expect(baseLine).not.toContain("level1")
      expect(baseLine).not.toContain("level2")
      expect(baseLine).not.toContain("level3")

      expect(level1Line).toBeDefined()
      expect(level1Line).toContain("id=base")
      expect(level1Line).toContain("level1=v1")
      expect(level1Line).not.toContain("level2")
      expect(level1Line).not.toContain("level3")

      expect(level2Line).toBeDefined()
      expect(level2Line).toContain("id=base")
      expect(level2Line).toContain("level1=v1")
      expect(level2Line).toContain("level2=v2")
      expect(level2Line).not.toContain("level3")

      expect(level3Line).toBeDefined()
      expect(level3Line).toContain("id=base")
      expect(level3Line).toContain("level1=v1")
      expect(level3Line).toContain("level2=v2")
      expect(level3Line).toContain("level3=v3")
    })
  })

  describe("file output", () => {
    let testLogDir: string

    beforeEach(async () => {
      testLogDir = Global.Path.log
      await Log.init({ print: false, dev: true, level: "DEBUG" })
    })

    it("should write to log file", async () => {
      const logger = Log.create({ service: "file-test" })
      logger.info("test message")

      const logPath = Log.file()
      expect(logPath).toContain("dev.log")

      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("INFO")
      expect(content).toContain("test message")
    })

    it("should include service tag in log file", async () => {
      const logger = Log.create({ service: "my-service" })
      logger.info("test message")

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("service=my-service")
      expect(content).toContain("test message")
    })

    it("should include extra tags in log file", async () => {
      const logger = Log.create({ service: "my-service" })
      logger.info("test message", { customTag: "customValue" })

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("customTag=customValue")
      expect(content).toContain("test message")
    })

    it("should handle undefined and null values in extra tags", async () => {
      const logger = Log.create({ service: "service-null" })
      logger.info("test message", { validTag: "valid", nullTag: null, undefinedTag: undefined })

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("validTag=valid")
      expect(content).not.toContain("nullTag")
      expect(content).not.toContain("undefinedTag")
    })

    it("should format log with timestamp and duration", async () => {
      const logger = Log.create({ service: "format-test" })
      logger.info("test message")

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(content).toMatch(/\+\d+ms/)
    })

    it("should handle Error objects", async () => {
      const logger = Log.create({ service: "error-test" })
      const error = new Error("Test error")
      logger.info("test message", { error })

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("error=Test error")
      expect(content).toContain("test message")
    })

    it("should handle complex objects", async () => {
      const logger = Log.create({ service: "object-test" })
      const obj = { nested: { key: "value" } }
      logger.info("test message", { data: obj })

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain('data={"nested":{"key":"value"}}')
      expect(content).toContain("test message")
    })

    it("should log empty message", async () => {
      const logger = Log.create({ service: "empty-test" })
      logger.info()

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("INFO")
    })

    it("should handle time logging", async () => {
      const logger = Log.create({ service: "time-test" })
      const timer = logger.time("operation")
      await Bun.sleep(10)
      timer.stop()

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("operation")
      expect(content).toContain("started")
      expect(content).toContain("completed")
      expect(content).toContain("duration")
    })

    it("should support using statement for time", async () => {
      const logger = Log.create({ service: "time-test" })
      {
        using _ = logger.time("operation-with-dispose")
        await Bun.sleep(10)
      }

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("operation-with-dispose")
      expect(content).toContain("started")
      expect(content).toContain("completed")
      expect(content).toContain("duration")
    })

    it("should handle Chinese characters without garbled text", async () => {
      const logger = Log.create({ service: "中文测试" })
      logger.info("这是一条中文消息", { 标签: "中文值" })

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).toContain("这是一条中文消息")
      expect(content).toContain("中文测试")
      expect(content).toContain("标签=中文值")
      expect(content).not.toContain("�")
    })
  })

  describe("log levels", () => {
    beforeEach(async () => {
      await Log.init({ print: false, dev: true, level: "INFO" })
    })

    it("should filter DEBUG logs when level is INFO", async () => {
      const logger = Log.create({ service: "level-test" })
      logger.debug("Should not be logged")
      logger.info("Should be logged")

      const logPath = Log.file()
      const content = await fs.readFile(logPath, "utf-8")
      expect(content).not.toContain("DEBUG")
      expect(content).toContain("INFO")
      expect(content).toContain("Should be logged")
    })
  })

  describe("file", () => {
    it("should return log file path", async () => {
      await Log.init({ print: false, dev: true })
      const logPath = Log.file()
      expect(typeof logPath).toBe("string")
      expect(logPath).toContain("log")
      expect(logPath).toContain("dev.log")
    })
  })

  describe("Default", () => {
    it("should have a default logger", () => {
      expect(Log.Default).toBeDefined()
      expect(Log.Default.info).toBeFunction()
    })

    it("should use default cached logger", () => {
      const logger1 = Log.create({ service: "default" })
      const logger2 = Log.create({ service: "default" })
      expect(logger1).toBe(logger2)
    })
  })

  describe("init", () => {
    it("should create daily log files", async () => {
      await Log.init({ print: false, dev: false })
      const logPath = Log.file()
      const today = new Date().toISOString().split("T")[0]
      expect(logPath).toContain(`${today}.log`)
    })

    it("should create dev.log in dev mode", async () => {
      await Log.init({ print: false, dev: true })
      const logPath = Log.file()
      expect(logPath).toContain("dev.log")
    })
  })
})
