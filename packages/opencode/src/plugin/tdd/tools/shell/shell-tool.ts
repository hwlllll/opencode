/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs"
import path from "node:path"
import os, { EOL } from "node:os"
import crypto from "node:crypto"
import { debugLogger } from "../../utils/logger.js"
import type { ShellExecutionConfig, ShellExecutionResult, ShellOutputEvent } from "./shell-execution"
import { ShellExecutionService } from "./shell-execution"
import { stripShellWrapper, getShellConfiguration, hasBackgroundSyntax, addBackgroundSyntax } from "./shell-utils"

export const OUTPUT_UPDATE_INTERVAL_MS = 1000

export interface ShellToolParams {
  command: string
  description?: string
  dir_path?: string
  is_background?: boolean
  timeout?: number
  env?: NodeJS.ProcessEnv
}

export class ShellToolInvocation {
  constructor(
    private readonly params: ShellToolParams,
    private readonly cwd: string,
  ) {}

  async execute(
    signal: AbortSignal,
    updateOutputChunk?: (chunk: string) => void,
    shellExecutionConfig?: ShellExecutionConfig,
    _setPidCallback?: (pid: number) => void,
  ): Promise<ShellExecutionResult> {
    const strippedCommand = stripShellWrapper(this.params.command)

    const shellConfig = getShellConfiguration()
    const { shell } = shellConfig

    let commandToProcess = strippedCommand
    const alreadyHasBackground = hasBackgroundSyntax(strippedCommand, shell)

    if (this.params.is_background && !alreadyHasBackground) {
      commandToProcess = addBackgroundSyntax(strippedCommand, shell)
    }

    if (signal.aborted) {
      const errorText = "Command was cancelled by user before it could start."
      if (updateOutputChunk) {
        updateOutputChunk(errorText)
      }
      return {
        rawOutput: Buffer.from(errorText),
        output: errorText,
        exitCode: 1,
        signal: null,
        error: new Error(errorText),
        aborted: true,
        pid: undefined,
        executionMethod: "none",
      }
    }

    const isWindows = os.platform() === "win32"
    const tempFileName = `shell_pgrep_${crypto.randomBytes(6).toString("hex")}.tmp`
    const tempFilePath = path.join(os.tmpdir(), tempFileName)

    let timeoutMs: number | undefined

    const timeoutString = process.env["COSTRICT_SHELL_TIMEOUT"]
    if (timeoutString !== undefined) {
      if (timeoutString.toLowerCase() === "no" || timeoutString === "none" || timeoutString === "off") {
        timeoutMs = 0
      } else {
        const timeoutNum = Number(timeoutString)
        if (!isNaN(timeoutNum)) {
          timeoutMs = timeoutNum * 60 * 1000
        }
      }
    }
    if (timeoutMs === undefined) {
      timeoutMs = this.params.timeout
    }
    if (timeoutMs === undefined) {
      timeoutMs = 5 * 60 * 1000
    }

    const timeoutController = new AbortController()
    let timeoutTimer: NodeJS.Timeout | undefined

    const combinedController = new AbortController()

    const onAbort = () => combinedController.abort()

    try {
      let commandToExecute = commandToProcess.trim()

      const cwd = this.params.dir_path ? path.resolve(this.cwd, this.params.dir_path) : this.cwd

      let isBinaryStream = false

      const resetTimeout = () => {
        if (timeoutMs <= 0) {
          return
        }
        if (timeoutTimer) clearTimeout(timeoutTimer)
        // Inactivity timeout not implemented in this simplified version
      }

      signal.addEventListener("abort", onAbort, { once: true })
      timeoutController.signal.addEventListener("abort", onAbort, {
        once: true,
      })

      resetTimeout()

      const { result: resultPromise, pid } = await ShellExecutionService.execute(
        commandToExecute,
        cwd,
        (event: ShellOutputEvent) => {
          resetTimeout()
          if (!updateOutputChunk) {
            return
          }

          let shouldUpdate = false

          if (!isBinaryStream && event.type === "data") {
            shouldUpdate = true
          }

          if (shouldUpdate) {
            updateOutputChunk(event.chunk)
          }
        },
        combinedController.signal,
        false, // Interactive shell disabled
        {
          ...shellExecutionConfig,
          env: this.params.env,
          pager: "cat",
          timeout: timeoutMs,
        },
      )

      const result = await resultPromise

      let timeoutMessage = ""
      if (result.aborted) {
        if (timeoutController.signal.aborted) {
          timeoutMessage = `Command was automatically cancelled because it exceeded the timeout of ${(timeoutMs / 60000).toFixed(1)} minutes.`
        }
      }

      if (timeoutMessage && updateOutputChunk) {
        updateOutputChunk(`\nTimeout: ${timeoutMessage}`)
      }

      return result
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      signal.removeEventListener("abort", onAbort)
      timeoutController.signal.removeEventListener("abort", onAbort)
    }
  }
}
