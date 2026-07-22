import type { Hooks } from "@opencode-ai/plugin"
import { getShellConfiguration } from "../tools/shell"

export async function handleSystemTransform(
  context: Parameters<Exclude<Hooks["experimental.chat.system.transform"], undefined>>[0],
  output: { system: string[] },
): Promise<void> {
  const shellConfig = getShellConfiguration()
  const versionInfo = shellConfig.version ? ` (version ${shellConfig.version})` : ""
  const terminalInfo = `# Terminal Environment

You are running in a terminal environment with the following shell configuration:
- Shell Type: ${shellConfig.shell}
- Executable: ${shellConfig.executable}${versionInfo}
- Args Prefix: ${shellConfig.argsPrefix.join(" ")}

This information helps you understand the shell environment when executing commands.`

  if (output.system.length > 0) {
    output.system[0] += `\n\n${terminalInfo}`
  } else {
    output.system.push(terminalInfo)
  }
}
