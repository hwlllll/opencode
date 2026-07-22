import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import {
  handleConfig,
  handleSystemTransform,
  getTools,
  handleLLMError,
  handleNotificationEvent,
  handleSessionCreated,
} from "./handlers"
// import { Log } from "@/util/log"
import { MemoryMonitor } from "./memory"
// import { Bus } from "@/bus"
// import { MessageV2 } from "@/session/message-v2"
export { getCommands } from "./commands"

// const log = Log.create({ service: "tdd.plugin" })

let memoryMonitor: MemoryMonitor | null = null
let beforeExitHandler: (() => void) | null = null

export async function TDDPlugin(input: PluginInput): Promise<Hooks> {
  // _subscribeToChunkEvents()

  // 清理已存在的实例以防止内存泄漏
  if (memoryMonitor) {
    memoryMonitor.stop()
    memoryMonitor = null
  }

  // 移除旧的事件监听器
  if (beforeExitHandler) {
    process.off("beforeExit", beforeExitHandler)
    beforeExitHandler = null
  }

  memoryMonitor = new MemoryMonitor()
  memoryMonitor.start()

  // 创建新的事件监听器
  beforeExitHandler = () => {
    if (memoryMonitor) {
      memoryMonitor.stop()
      memoryMonitor = null
    }
  }
  process.on("beforeExit", beforeExitHandler)

  return {
    config: handleConfig,
    "experimental.chat.system.transform": handleSystemTransform,
    tool: getTools(),
    // "tool.execute.before": handleToolExecuteBefore,
    // "tool.execute.after": handleToolExecuteAfter,
    event: async (input) => {
      await handleSessionCreated(input)
      await handleLLMError(input)
      await handleNotificationEvent(input)
    },
  }
}

// function _subscribeToChunkEvents() {
//   try {
//     Bus.subscribe(MessageV2.Event.PartUpdated, (event) => {
//       const part = event.properties.part
//       const delta = event.properties.delta
//
//       if (part.type === "text" && part.text && delta) {
//         log.info("Model response chunk", {
//           sessionID: part.sessionID,
//           messageID: part.messageID,
//           partID: part.id,
//           delta: truncateString(delta, 200),
//           totalLength: part.text.length,
//         })
//       } else if (part.type === "tool") {
//         const toolPart = part as MessageV2.ToolPart
//         log.info("Tool chunk", {
//           sessionID: part.sessionID,
//           messageID: part.messageID,
//           callID: toolPart.callID,
//           tool: toolPart.tool,
//           status: toolPart.state.status,
//           input:
//             JSON.stringify(toolPart.state.input).length > 100
//               ? `${JSON.stringify(toolPart.state.input).substring(0, 100)}...`
//               : JSON.stringify(toolPart.state.input),
//         })
//       }
//     })
//   } catch {}
// }

// function truncateString(str: string, maxLength: number = 100): string {
//   if (str.length <= maxLength) return str
//   return str.substring(0, maxLength) + "... (truncated)"
// }

// async function handleToolExecuteBefore(
//   input: { tool: string; sessionID: string; callID: string },
//   output: { args: any },
// ) {
//   const argsString = JSON.stringify(output.args)
//   const truncatedArgs = truncateString(argsString)
//   log.info("Tool execute before", { tool: input.tool, callID: input.callID, args: truncatedArgs })
// }

// async function handleToolExecuteAfter(
//   input: { tool: string; sessionID: string; callID: string },
//   output: { title: string; output: string; metadata: any },
// ) {
//   const outputString = typeof output.output === "string" ? output.output : JSON.stringify(output.output)
//   const truncatedOutput = truncateString(outputString)
//   log.info("Tool execute after", {
//     tool: input.tool,
//     callID: input.callID,
//     title: output.title,
//     output: truncatedOutput,
//     metadata: typeof output.metadata === "object" ? JSON.stringify(output.metadata) : output.metadata,
//   })
// }
