import { Log } from "@/util/log"
import { LearningDetector } from "../detector"
import type { Hooks } from "@opencode-ai/plugin"
import { MessageV2 } from "@/session/message-v2"

const log = Log.create({ service: "learning.hooks.conversation" })

/**
 * Conversation hooks for learning detection
 * Integrates with the plugin hook system
 */
export namespace ConversationHooks {
  /**
   * Register conversation-related hooks
   */
  export function register(): Partial<Hooks> {
    // log.info("registering conversation hooks")
    return {
      // Hook into message events
      event: async (input: { event: any }) => {
        // First log before anything else to confirm this function is called
        // log.info(">>> CONVERSATION HOOK CALLED <<<", { inputType: input?.event?.type })
        try {
          // log.info("received event in conversation hook", {
          //   hasInput: !!input,
          //   hasEvent: !!input?.event,
          //   type: input?.event?.type,
          // })
          const event = input?.event
          if (!event) {
            log.warn("event is undefined in conversation hook")
            return
          }

          // Handle message-related events
          if (event.type?.startsWith("session.") || event.type?.startsWith("message.")) {
            // log.info("handling message event", { type: event.type })
            await handleMessageEvent(event)
          }

          // Handle tool output events
          if (event.type?.includes("tool") || event.type?.includes("bash")) {
            await handleToolEvent(event)
          }
        } catch (err) {
          log.error("conversation hook event handler error", {
            err: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          })
        }
      },
    }
  }

  /**
   * Handle message events for learning detection
   */
  async function handleMessageEvent(event: any): Promise<void> {
    try {
      // Check for message.updated event with user role
      // Event structure: { type: "message.updated", properties: { info: { role: "user" | "assistant", ... } } }
      const isUserMessage =
        event.type === "message.updated" &&
        event.properties?.info?.role === "user"

      if (isUserMessage) {
        const info = event.properties?.info
        const messageID = info?.id
        const sessionID = info?.sessionID || info?.sessionId

        log.info("user message detected, fetching parts", { messageID, sessionID })

        // Fetch message parts to get the actual content
        if (messageID) {
          const parts = await MessageV2.parts(messageID)
          const content = extractContentFromParts(parts)

          if (content) {
            const relatedFiles = extractRelatedFiles(event)

            log.info("processing user message for learning detection", {
              contentPreview: content.slice(0, 100),
              contentLength: content.length,
              sessionID,
              relatedFiles,
            })

            await LearningDetector.processUserMessage(content, sessionID, relatedFiles)
          } else {
            log.warn("no content extracted from message parts", {
              messageID,
              partsCount: parts.length,
              partsTypes: parts.map((p: any) => p.type),
            })
          }
        }
      }
    } catch (err) {
      log.error("failed to process message event", {
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    }
  }

  /**
   * Handle tool events for error detection
   */
  async function handleToolEvent(event: any): Promise<void> {
    try {
      const output = extractToolOutput(event)
      if (output) {
        const toolName = event.properties?.toolName || event.type
        const sessionId = event.properties?.sessionId || event.properties?.sessionID
        const relatedFiles = extractRelatedFiles(event)

        await LearningDetector.processToolOutput(toolName, output, sessionId, relatedFiles)
      }
    } catch (err) {
      log.error("failed to process tool event", { err })
    }
  }

  /**
   * Extract content from message parts
   * Parts are arrays of { type: "text" | "tool" | ..., text?: string, ... }
   */
  function extractContentFromParts(parts: any[]): string | undefined {
    if (!parts || !Array.isArray(parts)) return undefined

    const textParts: string[] = []
    for (const part of parts) {
      if (part.type === "text" && typeof part.text === "string") {
        textParts.push(part.text)
      }
    }

    if (textParts.length === 0) return undefined
    return textParts.join("\n")
  }

  /**
   * Extract tool output from an event
   */
  function extractToolOutput(event: any): string | undefined {
    if (typeof event.properties?.output === "string") {
      return event.properties.output
    }
    if (typeof event.properties?.result === "string") {
      return event.properties.result
    }
    if (event.properties?.output?.content) {
      return String(event.properties.output.content)
    }
    return undefined
  }

  /**
   * Extract related files from an event
   */
  function extractRelatedFiles(event: any): string[] | undefined {
    const files: string[] = []

    if (event.properties?.file) {
      files.push(event.properties.file)
    }
    if (event.properties?.filePath) {
      files.push(event.properties.filePath)
    }
    if (Array.isArray(event.properties?.files)) {
      files.push(...event.properties.files)
    }
    if (Array.isArray(event.properties?.relatedFiles)) {
      files.push(...event.properties.relatedFiles)
    }

    return files.length > 0 ? files : undefined
  }
}
