import { execSync } from "node:child_process"
import os from "node:os"
import { getShellConfiguration } from "./shell-utils.js"
import { debugLogger } from "../../utils/logger.js"

// Cache for system encoding to avoid repeated detection
// Use undefined to indicate "not yet checked" vs null meaning "checked but failed"
let cachedSystemEncoding: string | null | undefined = undefined

/**
 * Initialize encoding cache early to avoid issues during command execution
 */
export function initializeEncodingCache(): void {
  if (cachedSystemEncoding === undefined) {
    cachedSystemEncoding = getSystemEncoding()
    if (cachedSystemEncoding) {
      debugLogger.debug("Initialized system encoding cache", { encoding: cachedSystemEncoding })
    } else {
      debugLogger.warn(
        "Failed to detect system encoding during initialization. Will attempt per-buffer detection or fall back to UTF-8.",
      )
    }
  }
}

/**
 * Reset the encoding cache - useful for testing
 */
export function resetEncodingCache(): void {
  cachedSystemEncoding = undefined
  // Re-initialize after reset
  initializeEncodingCache()
}

/**
 * Validates if a buffer is valid UTF-8 by attempting to decode it.
 * Returns true if the buffer can be decoded as UTF-8 without errors.
 */
function isValidUtf8(buffer: Buffer): boolean {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true })
    decoder.decode(buffer)
    return true
  } catch {
    return false
  }
}

/**
 * Returns the appropriate encoding for a buffer, with smart detection.
 *
 * Strategy:
 * 1. Check if buffer is valid UTF-8 (UTF-8 has clear byte patterns)
 * 2. If not UTF-8 and on Windows, try Chinese encodings like GBK, GB2312, GB18030
 * 3. Fall back to system encoding (shell-specific)
 * 4. Final fallback to UTF-8
 *
 * This approach handles mixed environments where different programs output
 * different encodings (e.g., Python on Windows outputs GBK despite CP 65001,
 * Go outputs UTF-8 even when PowerShell uses GBK).
 *
 * Note: We don't use chardet for non-UTF-8 detection because it's unreliable
 * for short Chinese text (often misdetects GBK as ISO-8859-7 or other encodings).
 *
 * @param buffer A buffer to analyze for encoding.
 */
export function getCachedEncodingForBuffer(buffer: Buffer): string {
  const isWindows = globalThis.process?.platform === "win32"

  debugLogger.debug("getCachedEncodingForBuffer called", {
    isWindows,
    bufferLength: buffer.length,
    bufferPreview: buffer.subarray(0, 50).toString("hex"),
  })

  if (isWindows) {
    // 先检查是否是有效的 UTF-8
    if (isValidUtf8(buffer)) {
      const utf8Decoder = new TextDecoder("utf-8")
      const decoded = utf8Decoder.decode(buffer)
      // 检查是否包含中文字符
      if (containsChineseText(decoded)) {
        debugLogger.debug("Valid UTF-8 with Chinese detected on Windows", { encoding: "utf-8" })
        return "utf-8"
      }
    }

    // 如果不是 UTF-8，或者 UTF-8 中没有检测到中文，尝试其他中文编码
    // 优先尝试 GBK，因为 Python 在 Windows 上默认使用 GBK
    const encodingsToTry = ["gbk", "gb2312", "gb18030"]
    for (const encoding of encodingsToTry) {
      try {
        const decoder = new TextDecoder(encoding)
        const decoded = decoder.decode(buffer)
        debugLogger.debug("Trying encoding", { encoding, decodedPreview: decoded.substring(0, 50) })

        if (containsChineseText(decoded)) {
          debugLogger.debug("Detected Chinese encoding on Windows", { encoding })
          return encoding
        }
      } catch (e) {
        debugLogger.debug("Encoding decode failed", { encoding, error: String(e) })
        continue
      }
    }

    // 如果没有检测到中文，使用系统编码
    if (cachedSystemEncoding === undefined) {
      cachedSystemEncoding = getSystemEncoding()
    }
    if (cachedSystemEncoding) {
      debugLogger.debug("No Chinese detected, using system encoding", { encoding: cachedSystemEncoding })
      return cachedSystemEncoding
    }

    // 系统编码检测失败 - 默认使用 GBK（Windows 中文系统常见）
    debugLogger.debug("System encoding detection failed, falling back to GBK")
    return "gbk"
  }

  // Not Windows or Chinese encodings failed, check if valid UTF-8
  const isValid = isValidUtf8(buffer)
  debugLogger.debug("Checking if valid UTF-8", { isValid })

  if (isValid) {
    debugLogger.debug("Buffer is valid UTF-8, using utf-8 encoding")
    return "utf-8"
  }

  // Buffer is not UTF-8 - use system encoding
  if (cachedSystemEncoding === undefined) {
    cachedSystemEncoding = getSystemEncoding()
  }

  if (cachedSystemEncoding) {
    debugLogger.debug("Buffer is not UTF-8, using system encoding", { encoding: cachedSystemEncoding })
    return cachedSystemEncoding
  }

  // System encoding detection failed - fall back to UTF-8
  debugLogger.warn("System encoding detection failed, falling back to UTF-8")
  return "utf-8"
}

/**
 * Checks if text contains Chinese characters.
 * Using a simple threshold to handle buffers with mostly ASCII.
 */
function containsChineseText(text: string): boolean {
  if (!text || text.length === 0) return false

  let chineseCharCount = 0
  let totalChars = 0

  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code >= 0x4e00 && code <= 0x9fff) {
      chineseCharCount++
      totalChars++
    } else if (code >= 0x3400 && code <= 0x4dbf) {
      chineseCharCount++
      totalChars++
    } else if (char.trim() !== "") {
      totalChars++
    }
  }

  // 只要有中文字符就返回 true（降低阈值）
  return chineseCharCount > 0
}

/**
 * Detects the system encoding based on the platform and shell type.
 *
 * IMPORTANT: This should match the encoding of the ACTUAL shell that executes commands,
 * not the environment where the CLI is running.
 *
 * For Windows:
 * - bash/Git Bash/MSYS2: Check LANG environment variable (usually UTF-8)
 * - cmd.exe: Check Windows code page via chcp (usually GBK/GB2312 on Chinese systems)
 * - PowerShell: Usually UTF-8 (PowerShell Core) or depends on console encoding
 *
 * For Unix-like systems: Check LC_ALL, LC_CTYPE, LANG environment variables
 *
 * @returns The system encoding as a string, or null if detection fails.
 */
export function getSystemEncoding(): string | null {
  if (os.platform() === "win32") {
    // For Windows, we need to check which shell will actually execute commands
    let shellType: string
    try {
      const shellConfig = getShellConfiguration()
      shellType = shellConfig.shell
      debugLogger.debug("Detected shell type from getShellConfiguration", { shellType })
    } catch (error) {
      // If we can't determine shell type, use environment to guess
      shellType = process.env["MSYSTEM"] || process.env["SHELL"]?.includes("bash") ? "bash" : "cmd"
      debugLogger.warn("Failed to get shell configuration, using fallback detection", {
        error: error instanceof Error ? error.message : String(error),
        fallbackShell: shellType,
      })
    }

    // For bash-like shells on Windows, check LANG environment variable
    if (shellType === "bash") {
      const env = process.env
      const lang = env["LC_ALL"] || env["LC_CTYPE"] || env["LANG"]

      if (lang) {
        const match = lang.match(/\.(.+)/)
        if (match && match[1]) {
          const encoding = match[1].toLowerCase()
          debugLogger.debug("Using encoding from LANG for bash", { encoding, lang })
          return encoding
        }
        if (lang && !lang.includes(".")) {
          const encoding = lang.toLowerCase()
          debugLogger.debug("Using encoding from LANG for bash", { encoding, lang })
          return encoding
        }
      }
    }

    // For cmd.exe or when LANG is not set, use Windows code page
    if (shellType === "cmd" || shellType === "powershell") {
      try {
        const output = execSync("chcp", { encoding: "utf8" })
        const match = output.match(/:\s*(\d+)/)
        if (match) {
          const codePage = parseInt(match[1], 10)
          if (!isNaN(codePage)) {
            const encoding = windowsCodePageToEncoding(codePage)
            if (encoding) {
              debugLogger.debug("Using encoding from code page", { shellType, encoding, codePage })
            }
            return encoding
          }
        }
        throw new Error(`Unable to parse Windows code page from 'chcp' output "${output.trim()}". `)
      } catch (error) {
        debugLogger.warn("Failed to get Windows code page using 'chcp' command", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return null
  }

  // Unix-like
  // Use environment variables LC_ALL, LC_CTYPE, and LANG to determine the
  // system encoding. However, these environment variables might not always
  // be set or accurate. Handle cases where none of these variables are set.
  const env = process.env
  let locale = env["LC_ALL"] || env["LC_CTYPE"] || env["LANG"] || ""

  // Fallback to querying the system directly when environment variables are missing
  if (!locale) {
    try {
      locale = execSync("locale charmap", { encoding: "utf8" }).toString().trim()
    } catch (_e) {
      debugLogger.warn("Failed to get locale charmap")
      return null
    }
  }

  const match = locale.match(/\.(.+)/) // e.g., "en_US.UTF-8"
  if (match && match[1]) {
    return match[1].toLowerCase()
  }

  // Handle cases where locale charmap returns just the encoding name (e.g., "UTF-8")
  if (locale && !locale.includes(".")) {
    return locale.toLowerCase()
  }

  return null
}

/**
 * Converts a Windows code page number to a corresponding encoding name.
 * @param cp The Windows code page number (e.g., 437, 850, etc.)
 * @returns The corresponding encoding name as a string, or null if no mapping exists.
 */
export function windowsCodePageToEncoding(cp: number): string | null {
  // Most common mappings; extend as needed
  const map: { [key: number]: string } = {
    437: "cp437",
    850: "cp850",
    852: "cp852",
    866: "cp866",
    874: "windows-874",
    932: "shift_jis",
    936: "gb2312",
    949: "euc-kr",
    950: "big5",
    1200: "utf-16le",
    1201: "utf-16be",
    1250: "windows-1250",
    1251: "windows-1251",
    1252: "windows-1252",
    1253: "windows-1253",
    1254: "windows-1254",
    1255: "windows-1255",
    1256: "windows-1256",
    1257: "windows-1257",
    1258: "windows-1258",
    65001: "utf-8",
  }

  if (map[cp]) {
    return map[cp]
  }

  debugLogger.warn("Unable to determine encoding for windows code page", { codePage: cp })
  return null // Return null if no mapping found
}

// Encoding cache is lazily initialized on first use rather than at module load
// to ensure shell configuration is detected correctly before encoding detection
