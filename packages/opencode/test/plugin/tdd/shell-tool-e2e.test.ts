/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test"
import { ShellToolInvocation, type ShellToolParams } from "@/plugin/tdd/tools/shell/shell-tool"

describe("TDD Plugin Shell Tool E2E", () => {
  const cwd = process.cwd()

  it("simple echo command should return expected output", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "echo hello world" : "echo hello world",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("hello")
    expect(result.output).toContain("world")
  })

  it("command with description should work correctly", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "echo test" : "echo test",
      description: "Test command with description",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("test")
  })

  it("command with timeout should complete within timeout", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "echo timeout test" : "echo timeout test",
      timeout: 10000,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("timeout")
    expect(result.output).toContain("test")
  })

  it("command with custom directory should execute in that directory", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "echo %CD%" : "echo $PWD",
      dir_path: cwd,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
  })

  it("command that fails should return non-zero exit code", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "exit 1" : "exit 1",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.exitCode).toBe(1)
  })

  it("command with chained operators should execute all commands", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "echo first && echo second" : "echo first && echo second",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.output).toContain("first")
    expect(result.output).toContain("second")
  })

  it("command with pipe operator should work correctly", async () => {
    const params: ShellToolParams = {
      command:
        process.platform === "win32" ? 'echo "hello world" | findstr "hello"' : 'echo "hello world" | grep "hello"',
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.output).toContain("hello")
  })

  it("command with output redirection should create file", async () => {
    const tempFile = process.platform === "win32" ? "test_output.txt" : "/tmp/test_output.txt"

    const params: ShellToolParams = {
      command: process.platform === "win32" ? `echo test content > ${tempFile}` : `echo test content > ${tempFile}`,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()

    const readParams: ShellToolParams = {
      command: process.platform === "win32" ? `type ${tempFile}` : `cat ${tempFile}`,
    }
    const readInvocation = new ShellToolInvocation(readParams, cwd)
    const readResult = await readInvocation.execute(abortController.signal)

    expect(readResult.output).toContain("test")

    const cleanParams: ShellToolParams = {
      command: process.platform === "win32" ? `del ${tempFile}` : `rm ${tempFile}`,
    }
    const cleanInvocation = new ShellToolInvocation(cleanParams, cwd)
    await cleanInvocation.execute(abortController.signal)
  })

  it("command with append redirection should append to file", async () => {
    const tempFile = process.platform === "win32" ? "test_append.txt" : "/tmp/test_append.txt"
    const abortController = new AbortController()

    const writeParams: ShellToolParams = {
      command: process.platform === "win32" ? `echo first > ${tempFile}` : `echo first > ${tempFile}`,
    }
    const writeInvocation = new ShellToolInvocation(writeParams, cwd)
    await writeInvocation.execute(abortController.signal)

    const appendParams: ShellToolParams = {
      command: process.platform === "win32" ? `echo second >> ${tempFile}` : `echo second >> ${tempFile}`,
    }
    const appendInvocation = new ShellToolInvocation(appendParams, cwd)
    await appendInvocation.execute(abortController.signal)

    const readParams: ShellToolParams = {
      command: process.platform === "win32" ? `type ${tempFile}` : `cat ${tempFile}`,
    }
    const readInvocation = new ShellToolInvocation(readParams, cwd)
    const result = await readInvocation.execute(abortController.signal)

    expect(result.output).toContain("first")
    expect(result.output).toContain("second")

    const cleanParams: ShellToolParams = {
      command: process.platform === "win32" ? `del ${tempFile}` : `rm ${tempFile}`,
    }
    const cleanInvocation = new ShellToolInvocation(cleanParams, cwd)
    await cleanInvocation.execute(abortController.signal)
  })

  it("command with environment variable should work correctly", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "echo %GEMINI_CLI%" : "echo $GEMINI_CLI",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
  })

  it("command with quotes should handle spaces correctly", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? 'echo "hello world with spaces"' : 'echo "hello world with spaces"',
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("hello world with spaces")
  })

  it("command with special characters should be handled correctly", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? 'echo "test@#$%^&*()"' : 'echo "test@#$%^&*()"',
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
  })

  it("command with newlines in output should preserve formatting", async () => {
    const params: ShellToolParams = {
      command:
        process.platform === "win32"
          ? "echo line1 && echo line2 && echo line3"
          : "echo line1 && echo line2 && echo line3",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.output).toContain("line1")
    expect(result.output).toContain("line2")
    expect(result.output).toContain("line3")
  })

  it("command with timeout=0 should have no timeout", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "echo no timeout" : "echo no timeout",
      timeout: 0,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("no")
    expect(result.output).toContain("timeout")
  })

  it("command with very short timeout should timeout if command is slow", async () => {
    const sleepCommand = process.platform === "win32" ? 'powershell -Command "Start-Sleep -Seconds 10"' : "sleep 10"

    const params: ShellToolParams = {
      command: sleepCommand,
      timeout: 2000,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.aborted).toBe(true)
  }, 15000)

  it("command with is_background=true should execute in background", async () => {
    const params: ShellToolParams = {
      command: process.platform === "win32" ? "echo background test" : "echo background test",
      is_background: true,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
  })

  it("command with existing background syntax should preserve it", async () => {
    const commandWithBackground = process.platform === "win32" ? "START /B echo test" : "echo test &"

    const params: ShellToolParams = {
      command: commandWithBackground,
      is_background: true,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
  })

  it("multiple sequential commands should all execute", async () => {
    const abortController = new AbortController()

    const params1: ShellToolParams = {
      command: process.platform === "win32" ? "echo command1" : "echo command1",
    }
    const invocation1 = new ShellToolInvocation(params1, cwd)
    const result1 = await invocation1.execute(abortController.signal)

    const params2: ShellToolParams = {
      command: process.platform === "win32" ? "echo command2" : "echo command2",
    }
    const invocation2 = new ShellToolInvocation(params2, cwd)
    const result2 = await invocation2.execute(abortController.signal)

    const params3: ShellToolParams = {
      command: process.platform === "win32" ? "echo command3" : "echo command3",
    }
    const invocation3 = new ShellToolInvocation(params3, cwd)
    const result3 = await invocation3.execute(abortController.signal)

    expect(result1.output).toContain("command1")
    expect(result2.output).toContain("command2")
    expect(result3.output).toContain("command3")
  })

  it("command with invalid command should return error", async () => {
    const params: ShellToolParams = {
      command: "nonexistent-command-xyz-12345",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error !== null || result.exitCode !== 0).toBe(true)
  })

  it("command with empty string should handle gracefully", async () => {
    const params: ShellToolParams = {
      command: "",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result).toBeDefined()
  })

  it("command with whitespace only should handle gracefully", async () => {
    const params: ShellToolParams = {
      command: "   ",
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result).toBeDefined()
  })

  it("should handle streaming decoding with mixed encodings", async () => {
    const pythonCommand = `python -c "import random, string; print(''.join(random.choice(string.ascii_letters) for _ in range(1000))); print('=' * 100); print('你好，世界！')"`

    const params: ShellToolParams = {
      command: pythonCommand,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("=")
    expect(result.output).toContain("你好，世界！")
  })

  it("should handle mixed GBK encoding with ASCII and Chinese", async () => {
    const pythonCommand = `python -c "print('ASCII' * 100); print('测试中文'); print('More ASCII'); print('更多中文'); print('End')"`

    const params: ShellToolParams = {
      command: pythonCommand,
    }
    const invocation = new ShellToolInvocation(params, cwd)
    const abortController = new AbortController()

    const result = await invocation.execute(abortController.signal)

    expect(result.error).toBeNull()
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("ASCII")
    expect(result.output).toContain("测试中文")
    expect(result.output).toContain("More ASCII")
    expect(result.output).toContain("更多中文")
    expect(result.output).toContain("End")
  })
})
