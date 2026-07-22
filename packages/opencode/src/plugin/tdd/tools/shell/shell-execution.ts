/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from "node:os"
import { spawn } from "node:child_process"
import { getCachedEncodingForBuffer } from "./systemEncoding.js"
import { getShellConfiguration } from "./shell-utils.js"
import { debugLogger } from "../../utils/logger.js"

const log = debugLogger.clone().tag("scope", "shell-execution")

const SIGKILL_TIMEOUT_MS = 200

function args(executable: string, command: string) {
  const name = executable.toLowerCase()
  if (name.endsWith("powershell.exe")) {
    return ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", command]
  }
  if (name.endsWith("pwsh.exe") || name === "pwsh") {
    return ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]
  }
  return [command]
}

export type ShellOutputEvent = {
  type: "data"
  chunk: string
}

export interface ShellExecutionConfig {
  terminalWidth?: number
  terminalHeight?: number
  pager?: string
  showColor?: boolean
  defaultFg?: string
  defaultBg?: string
  sanitizationConfig?: {
    keepEnvVars?: string[]
    removeEnvVars?: string[]
  }
  env?: NodeJS.ProcessEnv
  disableDynamicLineTrimming?: boolean
  scrollback?: number
  timeout?: number
}

export interface ShellExecutionResult {
  rawOutput: Buffer
  output: string
  exitCode: number | null
  signal: number | null
  error: Error | null
  aborted: boolean
  pid: number | undefined
  executionMethod: "node-pty" | "child_process" | "none"
}

export interface ShellExecutionHandle {
  pid: number | undefined
  result: Promise<ShellExecutionResult>
}

export class ShellExecutionService {
  static async execute(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    _shouldUseNodePty: boolean,
    shellExecutionConfig: ShellExecutionConfig,
  ): Promise<ShellExecutionHandle> {
    return this.childProcessFallback(commandToExecute, cwd, onOutputEvent, abortSignal, shellExecutionConfig)
  }

  private static childProcessFallback(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    cfg: ShellExecutionConfig,
  ): ShellExecutionHandle {
    try {
      const isWindows = os.platform() === "win32"
      const shellConfig = getShellConfiguration()
      const { executable, argsPrefix } = shellConfig
      const shellArgs =
        shellConfig.shell === "powershell" ? args(executable, commandToExecute) : [...argsPrefix, commandToExecute]
      const timeoutMs = cfg.timeout

      log.info("Starting shell process", {
        executable,
        args: shellArgs,
        cwd,
        timeout: timeoutMs,
      })
      const child = spawn(executable, shellArgs, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsVerbatimArguments: isWindows ? false : undefined,
        shell: false,
        detached: !isWindows,
        windowsHide: isWindows,
        env: {
          ...process.env,
          ...cfg.env,
          GEMINI_CLI: "1",
          TERM: "xterm-256color",
          PAGER: "cat",
          GIT_PAGER: "cat",
        },
      })

      const result = new Promise<ShellExecutionResult>((resolve) => {
        let stdout: Buffer[] = []
        let stderr: Buffer[] = []
        let error: Error | null = null
        let exited = false

        let outputChunks: Buffer[] = []
        let timeoutTriggered = false
        let fixedEncoding: string | null = null

        const handleOutput = (data: Buffer, stream: "stdout" | "stderr") => {
          outputChunks.push(data)

          if (stream === "stdout") {
            stdout.push(data)
          } else {
            stderr.push(data)
          }

          // 对每个 chunk 单独检测编码并解码（流式输出）
          const chunkEncoding = getCachedEncodingForBuffer(data)
          let decoder: TextDecoder

          try {
            decoder = new TextDecoder(chunkEncoding)
          } catch {
            decoder = new TextDecoder("utf-8")
          }

          const decodedChunk = decoder.decode(data, { stream: true })

          if (decodedChunk.length > 0) {
            onOutputEvent({ type: "data", chunk: decodedChunk })
          }
        }

        const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
          exited = true

          const finalBuffer = Buffer.concat(outputChunks)
          const detectedEncoding = getCachedEncodingForBuffer(finalBuffer)
          const finalDecoder = new TextDecoder(detectedEncoding)
          const combinedOutput = finalDecoder.decode(finalBuffer)

          log.info("Shell process exited", {
            exitCode: code,
            signal,
            aborted: abortSignal.aborted || timeoutTriggered,
            outputLength: combinedOutput.length,
          })

          resolve({
            rawOutput: finalBuffer,
            output: combinedOutput,
            exitCode: code,
            signal: signal ? os.constants.signals[signal] : null,
            error,
            aborted: abortSignal.aborted || timeoutTriggered,
            pid: undefined,
            executionMethod: "child_process",
          })
        }

        child.stdout.on("data", (data: Buffer) => handleOutput(data, "stdout"))
        child.stderr.on("data", (data: Buffer) => handleOutput(data, "stderr"))
        child.on("error", (err) => {
          error = err
          handleExit(1, null)
        })

        let timeoutTimer: NodeJS.Timeout | undefined

        const abortHandler = async () => {
          timeoutTriggered = true
          if (child.pid && !exited) {
            if (isWindows) {
              spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"], { stdio: "ignore", windowsHide: true })
            } else {
              try {
                process.kill(-child.pid, "SIGTERM")
                await new Promise((res) => setTimeout(res, SIGKILL_TIMEOUT_MS))
                if (!exited) {
                  process.kill(-child.pid, "SIGKILL")
                }
              } catch (_e) {
                if (!exited) child.kill("SIGKILL")
              }
            }
          }
        }

        abortSignal.addEventListener("abort", abortHandler, { once: true })

        if (timeoutMs && timeoutMs > 0) {
          timeoutTimer = setTimeout(abortHandler, timeoutMs + 100)
        }

        const cleanup = () => {
          if (timeoutTimer) clearTimeout(timeoutTimer)
          abortSignal.removeEventListener("abort", abortHandler)
        }

        child.on("exit", (code, signal) => {
          cleanup()
          handleExit(code, signal)
        })
      })

      return { pid: child.pid, result }
    } catch (e) {
      const error = e as Error
      return {
        pid: undefined,
        result: Promise.resolve({
          error,
          rawOutput: Buffer.from(""),
          output: "",
          exitCode: 1,
          signal: null,
          aborted: false,
          pid: undefined,
          executionMethod: "none",
        }),
      }
    }
  }
}
