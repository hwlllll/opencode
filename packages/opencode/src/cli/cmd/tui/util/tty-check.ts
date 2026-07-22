/**
 * TTY 可用性检查工具
 * 解决 Windows ConPTY "假存活"导致的 ANSI 乱码问题
 */

export namespace TTYCheck {
  /**
   * 检查 TUI 是否可用（更严格的判断）
   */
  export function canUseTUI(): boolean {
    // 基础检查：stdout 必须是 TTY
    if (!process.stdout.isTTY) return false

    // 环境变量禁用检查
    if (process.env.NO_COLOR) return false
    if (process.env.CI === "true") return false
    if (process.env.OPENCODE_NO_TUI === "1") return false

    // Windows 平台特殊检查
    if (process.platform === "win32") {
      // 只在 Windows Terminal 或 VSCode Terminal 中启用 TUI
      // 避免 ConPTY 假存活问题
      const isWindowsTerminal = !!process.env.WT_SESSION
      const isVSCodeTerminal = process.env.TERM_PROGRAM === "vscode"
      const hasConEmu = !!process.env.ConEmuPID

      if (!isWindowsTerminal && !isVSCodeTerminal && !hasConEmu) {
        return false
      }
    }

    // stdin 也必须是 TTY（用于键盘交互）
    if (!process.stdin.isTTY) return false

    return true
  }

  /**
   * 检查 TTY 健康度（Windows 关键）
   */
  export function isTTYHealthy(): boolean {
    try {
      // 尝试写入空字符串，检查 stdout 是否正常
      process.stdout.write("")
      return true
    } catch {
      return false
    }
  }

  /**
   * 输出诊断信息（仅在调试模式）
   */
  export function logDiagnostics() {
    if (!process.env.OPENCODE_DEBUG_TTY) return

    console.debug("[TTY Diagnostics]", {
      platform: process.platform,
      "stdout.isTTY": process.stdout.isTTY,
      "stdin.isTTY": process.stdin.isTTY,
      TERM: process.env.TERM,
      TERM_PROGRAM: process.env.TERM_PROGRAM,
      WT_SESSION: process.env.WT_SESSION,
      ConEmuPID: process.env.ConEmuPID,
      NO_COLOR: process.env.NO_COLOR,
      OPENCODE_NO_TUI: process.env.OPENCODE_NO_TUI,
      CI: process.env.CI,
    })
  }
}
