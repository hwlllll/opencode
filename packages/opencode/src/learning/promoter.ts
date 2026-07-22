import { Log } from "@/util/log"
import { LearningStorage } from "./storage"
import { Config } from "@/config/config"
import { LearningEntry, LearningPriority } from "./types"

const log = Log.create({ service: "learning.promoter" })

/**
 * Learning promotion module
 * Handles learning management and skill candidate detection
 */
export namespace LearningPromoter {
  /**
   * Get promotion thresholds from config
   */
  async function getThresholds(): Promise<{
    recurrenceThreshold: number
    priorityThreshold: LearningPriority
  }> {
    try {
      const config = await Config.get()
      const learningConfig = (config as any).learning
      return {
        recurrenceThreshold: learningConfig?.autoPromote?.recurrenceThreshold ?? 3,
        priorityThreshold: learningConfig?.autoPromote?.priorityThreshold ?? "high",
      }
    } catch {
      return {
        recurrenceThreshold: 3,
        priorityThreshold: "high",
      }
    }
  }

  /**
   * Mark a learning as resolved
   */
  export async function resolveLearning(
    learningId: string,
    solution?: string,
    scope: "project" | "global" = "project",
  ): Promise<void> {
    try {
      const learnings = await LearningStorage.listLearnings(undefined, scope)
      const learning = learnings.find((l) => l.id === learningId)

      if (!learning) {
        throw new Error(`Learning not found: ${learningId}`)
      }

      const updates: Partial<LearningEntry> = {
        status: "resolved",
      }

      if (solution) {
        updates.suggestedAction = solution
      }

      await LearningStorage.updateLearning(
        {
          ...learning,
          ...updates,
        },
        scope,
      )

      log.info("resolved learning", { learningId })
    } catch (err) {
      log.error("failed to resolve learning", { learningId, err })
      throw err
    }
  }

  /**
   * Get pending learnings that might be ready for skill generation
   */
  export async function getSkillCandidates(
    scope: "project" | "global" = "project",
  ): Promise<LearningEntry[]> {
    const learnings = await LearningStorage.listLearnings(undefined, scope)
    const thresholds = await getThresholds()

    return learnings.filter((l) => {
      // Resolved high-priority learnings
      if (l.priority === "high" || l.priority === "critical") {
        if (l.status === "resolved") return true
      }

      // Recurring patterns
      if (l.recurrenceCount >= thresholds.recurrenceThreshold) {
        return true
      }

      return false
    })
  }

  /**
   * Run periodic check for skill candidates
   * Should be called at session end or periodically
   */
  export async function runPeriodicCheck(scope: "project" | "global" = "project"): Promise<{
    skillCandidates: number
  }> {
    const skillCandidates = (await getSkillCandidates(scope)).length

    return {
      skillCandidates,
    }
  }
}
