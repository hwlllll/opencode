import { Bus } from "@/bus"
import { Log } from "@/util/log"
import { LearningEvent } from "./events"
import { LearningStorage } from "./storage"
import { Config } from "@/config/config"
import { LearningCategory, LearningArea, LearningPriority, LearningSource } from "./types"

const log = Log.create({ service: "learning.detector" })

/**
 * Pattern detection triggers for different learning categories
 */
const CORRECTION_TRIGGERS = [
  "No, that's not right",
  "Actually,",
  "You're wrong",
  "That's outdated",
  "No,",
  "不对",
  "不是这样",
  "应该是",
  "实际上",
  "错了",
  "重新来",
  "不是这个意思",
]

const FEATURE_TRIGGERS = [
  "Can you also",
  "I wish you could",
  "Is there a way to",
  "Why can't you",
  "能不能也",
  "希望可以",
  "为什么不能",
  "需要有个功能",
  "能不能增加",
  "希望支持",
  "如果有",
  "能否添加",
]

const ERROR_PATTERNS = [
  "error:",
  "Error:",
  "ERROR:",
  "failed",
  "FAILED",
  "command not found",
  "No such file",
  "Permission denied",
  "fatal:",
  "Exception",
  "Traceback",
  "npm ERR!",
  "ModuleNotFoundError",
  "SyntaxError",
  "TypeError",
  "exit code",
  "non-zero",
]

/**
 * Learning pattern detector
 * Subscribes to bus events and detects learning opportunities
 */
export namespace LearningDetector {
  /**
   * Check if learning is enabled in config
   */
  async function isEnabled(): Promise<boolean> {
    try {
      const config = await Config.get()
      return (config as any).learning?.enabled !== false
    } catch {
      return true
    }
  }

  /**
   * Check if a specific auto-detect feature is enabled
   */
  async function isAutoDetectEnabled(feature: "corrections" | "errors" | "featureRequests"): Promise<boolean> {
    try {
      const config = await Config.get()
      const learningConfig = (config as any).learning
      if (!learningConfig?.enabled) return false
      return learningConfig?.autoDetect?.[feature] !== false
    } catch {
      return true
    }
  }

  /**
   * Detect if a message contains a user correction
   */
  export function detectCorrection(message: string): boolean {
    const lower = message.toLowerCase()
    return CORRECTION_TRIGGERS.some((trigger) => lower.includes(trigger.toLowerCase()))
  }

  /**
   * Detect if a message contains a feature request
   */
  export function detectFeatureRequest(message: string): boolean {
    const lower = message.toLowerCase()
    return FEATURE_TRIGGERS.some((trigger) => lower.includes(trigger.toLowerCase()))
  }

  /**
   * Detect if output contains an error pattern
   */
  export function detectErrorPattern(output: string): boolean {
    const lower = output.toLowerCase()
    return ERROR_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()))
  }

  /**
   * Extract capability description from a feature request message
   */
  export function extractCapability(message: string): string {
    let capability = message
    for (const trigger of FEATURE_TRIGGERS) {
      const regex = new RegExp(trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      capability = capability.replace(regex, "")
    }
    return capability.trim()
  }

  /**
   * Extract user context from a message
   */
  export function extractUserContext(message: string): string {
    return message
  }

  /**
   * Determine the area based on file path or context
   */
  export function determineArea(filePath?: string, context?: string): LearningArea {
    if (filePath) {
      if (filePath.includes("test") || filePath.includes("spec")) return "tests"
      if (filePath.includes("doc") || filePath.endsWith(".md")) return "docs"
      if (filePath.includes("config") || filePath.endsWith(".json") || filePath.endsWith(".yaml")) return "config"
      if (filePath.includes("infra") || filePath.includes("deploy") || filePath.includes("k8s")) return "infra"
      if (
        filePath.includes("src/components") ||
        filePath.includes("src/pages") ||
        filePath.endsWith(".tsx") ||
        filePath.endsWith(".vue")
      )
        return "frontend"
      if (
        filePath.includes("src/api") ||
        filePath.includes("src/services") ||
        filePath.endsWith(".go") ||
        filePath.endsWith(".rs")
      )
        return "backend"
    }

    if (context) {
      const lower = context.toLowerCase()
      if (lower.includes("test") || lower.includes("测试")) return "tests"
      if (lower.includes("document") || lower.includes("文档")) return "docs"
      if (lower.includes("config") || lower.includes("配置")) return "config"
      if (lower.includes("deploy") || lower.includes("部署")) return "infra"
      if (lower.includes("ui") || lower.includes("页面") || lower.includes("组件")) return "frontend"
      if (lower.includes("api") || lower.includes("服务") || lower.includes("后端")) return "backend"
    }

    return "general"
  }

  /**
   * Generate a pattern key for deduplication
   */
  export function generatePatternKey(category: LearningCategory, summary: string): string {
    const normalized = summary
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, ".")
      .slice(0, 50)
    return `${category}.${normalized}`
  }

  /**
   * Subscribe to bus events for learning detection
   */
  export function subscribe(): () => void {
    const unsubscribers: (() => void)[] = []

    // Note: The actual event subscription will depend on the available session events
    // This is a placeholder that will be connected via the plugin system

    log.info("learning detector subscribed")

    return () => {
      for (const unsub of unsubscribers) {
        unsub()
      }
      log.info("learning detector unsubscribed")
    }
  }

  /**
   * Process a user message for learning opportunities
   */
  export async function processUserMessage(
    message: string,
    sessionId?: string,
    relatedFiles?: string[],
  ): Promise<void> {
    if (!(await isEnabled())) return

    // Detect corrections
    if (await isAutoDetectEnabled("corrections")) {
      if (detectCorrection(message)) {
        log.info("correction detected", { message: message.slice(0, 100) })

        const summary = extractSummaryFromCorrection(message)
        const area = determineArea(relatedFiles?.[0], message)
        const patternKey = generatePatternKey("correction", summary)

        Bus.publish(LearningEvent.Detected, {
          category: "correction",
          summary,
          details: message,
          message,
          sessionId,
          relatedFiles,
        })

        // Create the learning entry
        await LearningStorage.createLearning({
          category: "correction",
          priority: "medium",
          status: "pending",
          area,
          summary,
          details: message,
          source: "user_feedback",
          relatedFiles,
          patternKey,
        })
      }
    }

    // Detect feature requests
    if (await isAutoDetectEnabled("featureRequests")) {
      if (detectFeatureRequest(message)) {
        log.info("feature request detected", { message: message.slice(0, 100) })

        const capability = extractCapability(message)

        Bus.publish(LearningEvent.FeatureRequestDetected, {
          capability,
          userContext: message,
          message,
          sessionId,
        })

        // Create feature request entry
        const entry = await LearningStorage.createFeatureRequest({
          priority: "medium",
          status: "pending",
          capability,
          userContext: message,
          complexity: "medium", // Will be refined by LLM later
          frequency: "first_time",
        })

        // Emit suggestion event for simple/medium complexity
        Bus.publish(LearningEvent.SkillSuggestion, {
          sessionId: sessionId || "",
          capability,
          featureEntryId: entry.id,
          complexity: entry.complexity,
        })
      }
    }
  }

  /**
   * Process tool output for error patterns
   */
  export async function processToolOutput(
    toolName: string,
    output: string,
    sessionId?: string,
    relatedFiles?: string[],
  ): Promise<void> {
    if (!(await isEnabled())) return
    if (!(await isAutoDetectEnabled("errors"))) return

    if (detectErrorPattern(output)) {
      log.info("error pattern detected", { toolName, output: output.slice(0, 200) })

      const summary = extractSummaryFromError(output)
      const area = determineArea(relatedFiles?.[0], output)

      Bus.publish(LearningEvent.ErrorDetected, {
        summary,
        error: output,
        context: `Tool: ${toolName}`,
        sessionId,
        relatedFiles,
      })

      // Create error entry
      await LearningStorage.createError({
        priority: "medium",
        status: "pending",
        summary,
        error: output,
        context: `Tool: ${toolName}`,
        relatedFiles,
      })
    }
  }
}

/**
 * Extract a summary from a correction message
 */
function extractSummaryFromCorrection(message: string): string {
  // Take first meaningful sentence or up to 100 chars
  const sentences = message.split(/[.!?。！？]/)
  const first = sentences[0]?.trim() || message.slice(0, 100)
  return first.length > 100 ? first.slice(0, 97) + "..." : first
}

/**
 * Extract a summary from an error message
 */
function extractSummaryFromError(error: string): string {
  // Try to find the first error line
  const lines = error.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && (trimmed.includes("Error") || trimmed.includes("error") || trimmed.includes("FAILED"))) {
      return trimmed.length > 100 ? trimmed.slice(0, 97) + "..." : trimmed
    }
  }
  return error.slice(0, 100)
}
