import type { Plugin, Hooks, PluginInput } from "@opencode-ai/plugin"
import { Log } from "@/util/log"
import { LearningPromoter } from "./promoter"
import { ConversationHooks, SessionEndHooks } from "./hooks"

const log = Log.create({ service: "learning.plugin" })

/**
 * Learning system plugin
 * Integrates with the plugin system to enable learning detection
 */
export const LearningPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  log.info("initializing learning plugin", { directory: input.directory })

  // Register individual hooks
  const conversationHooks = ConversationHooks.register()
  const sessionEndHooks = SessionEndHooks.register()

  log.info("hooks registered", {
    conversationHasEvent: typeof conversationHooks.event === "function",
    sessionEndHasEvent: typeof sessionEndHooks.event === "function",
  })

  // Run periodic check on init
  LearningPromoter.runPeriodicCheck("project").catch((err) => {
    log.warn("failed to run periodic check on init", { err })
  })

  // Return combined hooks - both modules have an 'event' hook, so we chain them
  return {
    event: async (input: { event: any }) => {
      // log.info(">>> LEARNING PLUGIN EVENT CALLED <<<", { eventType: input?.event?.type })
      // Call conversation hooks first
      if (conversationHooks.event) {
        try {
          await conversationHooks.event(input)
        } catch (err) {
          log.error("conversation event handler error", { err })
        }
      }
      // Then call session end hooks
      if (sessionEndHooks.event) {
        try {
          await sessionEndHooks.event(input)
        } catch (err) {
          log.error("session end event handler error", { err })
        }
      }
    },
  }
}
