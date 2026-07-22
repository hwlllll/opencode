import { Log } from "@/util/log"
import { LearningStorage } from "../storage"
import { LearningEvent } from "../events"
import { Bus } from "@/bus"
import type { Hooks } from "@opencode-ai/plugin"

const log = Log.create({ service: "learning.hooks.session-end" })

/**
 * Session end hooks for learning summary
 */
export namespace SessionEndHooks {
  /**
   * Register session end hooks
   */
  export function register(): Partial<Hooks> {
    return {
      event: async (input: { event: any }) => {
        const event = input.event

        // Handle session end events
        if (event.type === "session.ended" || event.type === "session.deleted") {
          await handleSessionEnd(event)
        }
      },
    }
  }

  /**
   * Handle session end events
   */
  async function handleSessionEnd(event: any): Promise<void> {
    try {
      const sessionId = event.properties?.sessionId || event.properties?.info?.id
      if (!sessionId) return

      // Get pending learnings and candidates
      const learnings = await LearningStorage.listLearnings({ status: "pending" })
      const candidates = await LearningStorage.listCandidates({ status: "draft" })

      if (learnings.length > 0 || candidates.length > 0) {
        log.info("session ended with pending items", {
          sessionId,
          pendingLearnings: learnings.length,
          pendingCandidates: candidates.length,
        })

        // Emit summary event
        Bus.publish(LearningEvent.SessionEndSummary, {
          sessionId,
          pendingLearnings: learnings.length,
          pendingCandidates: candidates.length,
        })

        // Optionally emit a system message
        Bus.publish(LearningEvent.SystemMessage, {
          sessionId,
          content: `<session-summary>
Session ended with pending items:
- ${learnings.length} learning(s) awaiting review
- ${candidates.length} skill candidate(s) awaiting approval

Review them with:
- \`cs learning list\` - List pending learnings
- \`cs skill candidates\` - Review skill candidates
</session-summary>`,
        })
      }
    } catch (err) {
      log.error("failed to handle session end", { err })
    }
  }
}
