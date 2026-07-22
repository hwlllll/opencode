import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import {
  LearningEntry,
  ErrorEntry,
  FeatureRequestEntry,
  SkillCandidate,
  LearningCategory,
  LearningPriority,
  LearningStatus,
} from "./types"

/**
 * Learning system event definitions following existing BusEvent patterns
 * @see src/session/index.ts Event definitions
 */
export namespace LearningEvent {
  /**
   * Emitted when a learning pattern is detected
   */
  export const Detected = BusEvent.define(
    "learning.detected",
    z.object({
      category: LearningCategory,
      summary: z.string(),
      details: z.string(),
      message: z.string(), // Original user message
      sessionId: z.string().optional(),
      relatedFiles: z.array(z.string()).optional(),
    }),
  )

  /**
   * Emitted when a learning entry is created
   */
  export const EntryCreated = BusEvent.define(
    "learning.entry.created",
    z.object({
      entry: LearningEntry,
    }),
  )

  /**
   * Emitted when a learning entry is updated
   */
  export const EntryUpdated = BusEvent.define(
    "learning.entry.updated",
    z.object({
      entry: LearningEntry,
      previousStatus: LearningStatus.optional(),
    }),
  )

  /**
   * Emitted when an error pattern is detected
   */
  export const ErrorDetected = BusEvent.define(
    "learning.error.detected",
    z.object({
      summary: z.string(),
      error: z.string(),
      context: z.string(),
      sessionId: z.string().optional(),
      relatedFiles: z.array(z.string()).optional(),
    }),
  )

  /**
   * Emitted when an error entry is created
   */
  export const ErrorEntryCreated = BusEvent.define(
    "learning.error.created",
    z.object({
      entry: ErrorEntry,
    }),
  )

  /**
   * Emitted when a feature request is detected
   */
  export const FeatureRequestDetected = BusEvent.define(
    "learning.feature.detected",
    z.object({
      capability: z.string(),
      userContext: z.string(),
      message: z.string(),
      sessionId: z.string().optional(),
      conversationContext: z.string().optional(),
    }),
  )

  /**
   * Emitted when a feature request entry is created
   */
  export const FeatureEntryCreated = BusEvent.define(
    "learning.feature.created",
    z.object({
      entry: FeatureRequestEntry,
    }),
  )

  /**
   * Emitted when a skill candidate is created
   */
  export const CandidateCreated = BusEvent.define(
    "learning.candidate.created",
    z.object({
      candidate: SkillCandidate,
    }),
  )

  /**
   * Emitted when a skill candidate is approved
   */
  export const CandidateApproved = BusEvent.define(
    "learning.candidate.approved",
    z.object({
      candidateId: z.string(),
      skillPath: z.string(),
    }),
  )

  /**
   * Emitted when a skill candidate is rejected
   */
  export const CandidateRejected = BusEvent.define(
    "learning.candidate.rejected",
    z.object({
      candidateId: z.string(),
      reason: z.string().optional(),
    }),
  )

  /**
   * Emitted when a skill is pushed to server
   */
  export const CandidatePushed = BusEvent.define(
    "learning.candidate.pushed",
    z.object({
      candidateId: z.string(),
      remoteId: z.string(),
      remoteUrl: z.string(),
    }),
  )

  /**
   * Emitted when a skill suggestion should be shown to the user
   */
  export const SkillSuggestion = BusEvent.define(
    "learning.skill.suggestion",
    z.object({
      sessionId: z.string(),
      capability: z.string(),
      featureEntryId: z.string(),
      complexity: z.enum(["simple", "medium", "complex"]),
    }),
  )

  /**
   * Emitted when a session ends with pending learning items
   */
  export const SessionEndSummary = BusEvent.define(
    "learning.session.summary",
    z.object({
      sessionId: z.string(),
      pendingLearnings: z.number(),
      pendingCandidates: z.number(),
    }),
  )

  /**
   * Emitted to show a system message in the session
   */
  export const SystemMessage = BusEvent.define(
    "learning.system.message",
    z.object({
      sessionId: z.string(),
      content: z.string(),
      metadata: z.record(z.string(), z.any()).optional(),
    }),
  )
}
