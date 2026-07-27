import path from "path"
import { generateText } from "ai"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"
import { LearningStorage } from "./storage"
import { LearningEvent } from "./events"
import { Bus } from "@/bus"
import {
  SkillCandidate,
  LearningEntry,
  ErrorEntry,
  FeatureRequestEntry,
  CandidateSourceType,
  generateCandidateId,
} from "./types"
import { Provider } from "@/provider/provider"

const log = Log.create({ service: "learning.generator" })

/**
 * System prompt for skill generation
 */
const SKILL_GENERATION_SYSTEM_PROMPT = `You are a skill extraction expert. Given learning entries, errors, or feature requests, generate a reusable SKILL.md file.

The skill should:
1. Be self-contained and usable without the original context
2. Follow the Agent Skills specification format
3. Include clear triggers for when to use the skill
4. Provide actionable steps and examples

Output format - respond with ONLY valid JSON (no code blocks):
{
  "name": "skill-name-in-kebab-case",
  "description": "Brief description of what this skill does",
  "content": "Full SKILL.md content in markdown (escape any quotes and backslashes properly)",
  "confidence": 0.85
}

IMPORTANT: Return raw JSON only, NOT wrapped in code blocks.

The content field should contain valid markdown with frontmatter:
---
name: skill-name
description: "Description"
---

# Skill Title

Instructions and examples...
`

/**
 * Skill generator module
 * Uses LLM to generate skills from learning entries
 */
export namespace SkillGenerator {
  /**
   * Check if skill generation should be triggered based on entries
   */
  export function shouldGenerateSkill(entries: (LearningEntry | ErrorEntry | FeatureRequestEntry)[]): boolean {
    // Condition 1: At least 2 similar entries (recurring pattern)
    const recurring = entries.filter((e) => {
      if ("recurrenceCount" in e) return e.recurrenceCount >= 2
      return false
    })
    if (recurring.length >= 1) return true

    // Condition 2: 1 high priority and resolved entry
    const highPriorityResolved = entries.filter(
      (e) => e.priority === "high" && (e.status === "resolved" || e.status === "implemented"),
    )
    if (highPriorityResolved.length >= 1) return true

    // Condition 3: Feature request with simple or medium complexity
    const simpleFeatures = entries.filter((e) => {
      if ("complexity" in e) {
        return e.complexity === "simple" || e.complexity === "medium"
      }
      return false
    })
    if (simpleFeatures.length >= 1) return true

    return false
  }

  /**
   * Build the prompt for skill generation
   */
  function buildSkillGenerationPrompt(
    entries: (LearningEntry | ErrorEntry | FeatureRequestEntry)[],
    context: {
      projectName?: string
      projectType?: string
      recentFiles?: string[]
      conversationContext?: string
    },
  ): string {
    const entryDescriptions = entries
      .map((e) => {
        if ("capability" in e) {
          // FeatureRequestEntry
          return `
**Feature Request ID**: ${e.id}
**Capability Needed**: ${e.capability}
**User Context**: ${e.userContext}
**Complexity**: ${e.complexity}
**Suggested Implementation**: ${e.suggestedImplementation || "None provided"}
`
        } else if ("error" in e) {
          // ErrorEntry
          return `
**Error ID**: ${e.id}
**Summary**: ${e.summary}
**Error**: ${e.error.slice(0, 500)}
**Context**: ${e.context}
**Suggested Fix**: ${e.suggestedFix || "None provided"}
`
        } else {
          // LearningEntry
          return `
**Learning ID**: ${e.id}
**Category**: ${e.category}
**Summary**: ${e.summary}
**Details**: ${e.details}
**Suggested Action**: ${e.suggestedAction || "None provided"}
`
        }
      })
      .join("\n---\n")

    return `
Based on the following entries, generate a reusable SKILL.md:

${entryDescriptions}

**Project Context**:
- Project Name: ${context.projectName || "Unknown"}
- Project Type: ${context.projectType || "Unknown"}
- Recent Files: ${context.recentFiles?.join(", ") || "None"}

${context.conversationContext ? `
**Recent Conversation Context**:
${context.conversationContext.slice(0, 2000)}
` : ""}

Generate a skill that:
1. Addresses the user's stated capability needs
2. Is practical and actionable
3. Follows the Agent Skills specification format
4. Includes clear triggers and examples
`
  }

  /**
   * Parse the LLM response to extract skill data
   */
  function parseSkillResponse(response: string): {
    name: string
    description: string
    content: string
    confidence: number
  } | null {
    try {
      // Try to extract JSON from code block (handle nested backticks with greedy match)
      const jsonMatch = response.match(/```json\s*([\s\S]*)```/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1].trim())
        return {
          name: parsed.name || "unnamed-skill",
          description: parsed.description || "",
          content: parsed.content || "",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
        }
      }

      // Try to parse entire response as JSON
      const parsed = JSON.parse(response)
      return {
        name: parsed.name || "unnamed-skill",
        description: parsed.description || "",
        content: parsed.content || "",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      }
    } catch (parseError) {
      // Log more details for debugging
      log.warn("failed to parse skill response", {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        responseLength: response.length,
        responsePreview: response.slice(0, 500),
        responseEnd: response.slice(-200),
      })
      return null
    }
  }

  /**
   * Determine source type from entries
   */
  function determineSourceType(entries: (LearningEntry | ErrorEntry | FeatureRequestEntry)[]): CandidateSourceType {
    for (const e of entries) {
      if ("capability" in e) return "from_feature"
      if ("error" in e) return "from_error"
    }
    return "from_learning"
  }

  /**
   * Generate a skill candidate from entries using LLM
   */
  export async function generate(
    sourceEntries: (LearningEntry | ErrorEntry | FeatureRequestEntry)[],
    context: {
      projectName?: string
      projectType?: string
      recentFiles?: string[]
      conversationContext?: string
    } = {},
  ): Promise<SkillCandidate | null> {
    try {
      const prompt = buildSkillGenerationPrompt(sourceEntries, context)

      // Get model for LLM call
      const modelInfo = await Provider.defaultModel()
      if (!modelInfo) {
        log.warn("no default model available for skill generation")
        return null
      }

      const model = await Provider.getModel(modelInfo.providerID, modelInfo.modelID)
      const language = await Provider.getLanguage(model)

      // Call LLM using generateText
      const response = await generateText({
        model: language,
        system: SKILL_GENERATION_SYSTEM_PROMPT,
        prompt: prompt,
        maxOutputTokens: 4096,
      })

      const skill = parseSkillResponse(response.text)
      if (!skill) {
        log.error("failed to parse skill from LLM response")
        return null
      }

      const candidate: SkillCandidate = {
        id: generateCandidateId(),
        createdAt: new Date().toISOString(),
        status: "draft",
        name: skill.name,
        description: skill.description,
        content: skill.content,
        sourceType: determineSourceType(sourceEntries),
        sourceIds: sourceEntries.map((e) => e.id),
        confidence: skill.confidence,
        frequency: sourceEntries.length,
        pushStatus: "local_only",
      }

      // Save the candidate
      await LearningStorage.saveCandidate(candidate)

      // Emit event
      Bus.publish(LearningEvent.CandidateCreated, { candidate })

      log.info("generated skill candidate", { id: candidate.id, name: candidate.name })
      return candidate
    } catch (err) {
      log.error("failed to generate skill", { err })
      return null
    }
  }

  /**
   * Generate a skill from a feature request
   */
  export async function generateFromFeatureRequest(
    featureRequest: FeatureRequestEntry,
    conversationContext?: string,
  ): Promise<SkillCandidate | null> {
    return generate([featureRequest], {
      conversationContext,
    })
  }

  /**
   * Generate a skill from a learning entry
   */
  export async function generateFromLearning(
    learning: LearningEntry,
    context: {
      projectName?: string
      recentFiles?: string[]
    } = {},
  ): Promise<SkillCandidate | null> {
    return generate([learning], context)
  }

  /**
   * Generate a skill from an error entry
   */
  export async function generateFromError(
    error: ErrorEntry,
    context: {
      projectName?: string
      recentFiles?: string[]
    } = {},
  ): Promise<SkillCandidate | null> {
    return generate([error], context)
  }

  /**
   * Promote a candidate to a formal skill
   */
  export async function promoteToSkill(candidateId: string): Promise<string | null> {
    try {
      const candidate = await LearningStorage.getCandidate(candidateId)
      if (!candidate) {
        throw new Error(`Candidate not found: ${candidateId}`)
      }

      // Create skill directory
      const skillDir = path.join(Instance.directory, ".dicode", "skill", candidate.name)
      await Filesystem.write(path.join(skillDir, "SKILL.md"), candidate.content)

      // Update candidate status
      await LearningStorage.updateCandidateStatus(candidateId, "approved", {
        skillPath: skillDir,
      })

      // Emit event
      Bus.publish(LearningEvent.CandidateApproved, {
        candidateId,
        skillPath: skillDir,
      })

      // Update source entries
      for (const sourceId of candidate.sourceIds) {
        try {
          // Try to update as learning entry
          const learnings = await LearningStorage.listLearnings()
          const learning = learnings.find((l) => l.id === sourceId)
          if (learning) {
            await LearningStorage.updateLearning(
              {
                ...learning,
                status: "skill_created",
                skillPath: skillDir,
              },
              "project",
            )
          }
        } catch {
          // Ignore errors updating source entries
        }
      }

      log.info("promoted candidate to skill", { candidateId, skillPath: skillDir })
      return skillDir
    } catch (err) {
      log.error("failed to promote candidate to skill", { candidateId, err })
      return null
    }
  }

  /**
   * Reject a skill candidate
   */
  export async function rejectCandidate(candidateId: string, reason?: string): Promise<void> {
    try {
      await LearningStorage.updateCandidateStatus(candidateId, "rejected")

      Bus.publish(LearningEvent.CandidateRejected, {
        candidateId,
        reason,
      })

      log.info("rejected skill candidate", { candidateId, reason })
    } catch (err) {
      log.error("failed to reject candidate", { candidateId, err })
      throw err
    }
  }
}
