import z from "zod"

/**
 * Learning system type definitions following existing Zod schema patterns
 * @see src/config/config.ts for schema patterns
 */

// ============================================================================
// Learning Entry Types
// ============================================================================

export const LearningCategory = z.enum([
  "correction", // User correction
  "knowledge_gap", // Knowledge gap identified
  "best_practice", // Best practice discovered
  "error_pattern", // Error pattern recognized
  "workflow", // Workflow pattern discovered
])
export type LearningCategory = z.infer<typeof LearningCategory>

export const LearningPriority = z.enum(["low", "medium", "high", "critical"])
export type LearningPriority = z.infer<typeof LearningPriority>

export const LearningStatus = z.enum(["pending", "in_progress", "resolved", "skill_created"])
export type LearningStatus = z.infer<typeof LearningStatus>

export const LearningArea = z.enum(["frontend", "backend", "infra", "tests", "docs", "config", "general"])
export type LearningArea = z.infer<typeof LearningArea>

export const LearningSource = z.enum(["conversation", "error", "user_feedback", "auto_detect"])
export type LearningSource = z.infer<typeof LearningSource>

/**
 * Generates a learning entry ID in format: LRN-YYYYMMDD-XXX
 */
export function generateLearningId(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "")
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `LRN-${dateStr}-${random}`
}

export const LearningEntry = z.object({
  id: z.string().regex(/^LRN-\d{8}-[A-Z0-9]{3}$/),
  category: LearningCategory,
  logged: z.string().datetime(),
  priority: LearningPriority,
  status: LearningStatus,
  area: LearningArea,

  summary: z.string(),
  details: z.string(),
  suggestedAction: z.string().optional(),

  // Metadata
  source: LearningSource,
  relatedFiles: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  seeAlso: z.array(z.string()).optional(), // Related learning entry IDs

  // Pattern tracking for deduplication
  patternKey: z.string().optional(),
  recurrenceCount: z.number().default(1),
  firstSeen: z.string().datetime().optional(),
  lastSeen: z.string().datetime().optional(),

  // Skill generation info
  skillPath: z.string().optional(),
})
export type LearningEntry = z.infer<typeof LearningEntry>

// ============================================================================
// Error Entry Types
// ============================================================================

export const ErrorStatus = z.enum(["pending", "in_progress", "resolved", "wont_fix"])
export type ErrorStatus = z.infer<typeof ErrorStatus>

export const ErrorReproducible = z.enum(["yes", "no", "unknown"])
export type ErrorReproducible = z.infer<typeof ErrorReproducible>

/**
 * Generates an error entry ID in format: ERR-YYYYMMDD-XXX
 */
export function generateErrorId(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "")
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `ERR-${dateStr}-${random}`
}

export const ErrorEntry = z.object({
  id: z.string().regex(/^ERR-\d{8}-[A-Z0-9]{3}$/),
  logged: z.string().datetime(),
  priority: LearningPriority,
  status: ErrorStatus,

  summary: z.string(),
  error: z.string(), // Original error message
  context: z.string(), // Trigger context
  suggestedFix: z.string().optional(),

  // Metadata
  reproducible: ErrorReproducible.default("unknown"),
  relatedFiles: z.array(z.string()).optional(),
  seeAlso: z.array(z.string()).optional(),

  // Resolution info
  resolution: z
    .object({
      resolvedAt: z.string().datetime(),
      solution: z.string(),
      commitOrPR: z.string().optional(),
    })
    .optional(),
})
export type ErrorEntry = z.infer<typeof ErrorEntry>

// ============================================================================
// Feature Request Entry Types
// ============================================================================

export const FeatureStatus = z.enum(["pending", "in_progress", "implemented", "wont_implement"])
export type FeatureStatus = z.infer<typeof FeatureStatus>

export const FeatureComplexity = z.enum(["simple", "medium", "complex"])
export type FeatureComplexity = z.infer<typeof FeatureComplexity>

export const FeatureFrequency = z.enum(["first_time", "recurring"])
export type FeatureFrequency = z.infer<typeof FeatureFrequency>

/**
 * Generates a feature request ID in format: FEAT-YYYYMMDD-XXX
 */
export function generateFeatureId(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "")
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `FEAT-${dateStr}-${random}`
}

export const FeatureRequestEntry = z.object({
  id: z.string().regex(/^FEAT-\d{8}-[A-Z0-9]{3}$/),
  logged: z.string().datetime(),
  priority: LearningPriority,
  status: FeatureStatus,

  capability: z.string(), // What the user wants
  userContext: z.string(), // Why they need it
  complexity: FeatureComplexity,
  suggestedImplementation: z.string().optional(),

  // Metadata
  frequency: FeatureFrequency,
  relatedFeatures: z.array(z.string()).optional(),
})
export type FeatureRequestEntry = z.infer<typeof FeatureRequestEntry>

// ============================================================================
// Skill Candidate Types
// ============================================================================

export const CandidateStatus = z.enum(["draft", "review", "approved", "rejected", "pushed"])
export type CandidateStatus = z.infer<typeof CandidateStatus>

export const CandidateSourceType = z.enum(["from_learning", "from_error", "from_feature", "manual"])
export type CandidateSourceType = z.infer<typeof CandidateSourceType>

export const CandidatePushStatus = z.enum(["local_only", "pending_push", "pushed", "push_failed"])
export type CandidatePushStatus = z.infer<typeof CandidatePushStatus>

/**
 * Generates a candidate ID as UUID v4
 */
export function generateCandidateId(): string {
  return crypto.randomUUID()
}

export const SkillCandidate = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  status: CandidateStatus,

  // Skill content
  name: z.string(),
  description: z.string(),
  content: z.string(), // SKILL.md content

  // Source tracking
  sourceType: CandidateSourceType,
  sourceIds: z.array(z.string()), // Related learning/error/feature IDs

  // Scoring
  confidence: z.number().min(0).max(1),
  frequency: z.number(),

  // Push status
  pushStatus: CandidatePushStatus.default("local_only"),
  pushedAt: z.string().datetime().optional(),
  remoteId: z.string().optional(),
  remoteUrl: z.string().optional(),

  // Skill path (set when approved)
  skillPath: z.string().optional(),
})
export type SkillCandidate = z.infer<typeof SkillCandidate>

// ============================================================================
// Configuration Types
// ============================================================================

export const LearningAutoDetectConfig = z.object({
  corrections: z.boolean().default(true),
  errors: z.boolean().default(true),
  featureRequests: z.boolean().default(true),
})

export const LearningAutoPromoteConfig = z.object({
  recurrenceThreshold: z.number().default(3),
  priorityThreshold: LearningPriority.default("high"),
})

export const LearningPushConfig = z.object({
  enabled: z.boolean().default(false),
  autoPush: z.boolean().default(false),
  serverUrl: z.string().optional(),
  visibility: z.enum(["private", "team", "public"]).default("private"),
})

export const LearningConfig = z.object({
  enabled: z.boolean().default(true),
  autoDetect: LearningAutoDetectConfig.optional(),
  autoPromote: LearningAutoPromoteConfig.optional(),
  push: LearningPushConfig.optional(),
})
export type LearningConfig = z.infer<typeof LearningConfig>

// ============================================================================
// Union Types
// ============================================================================

export const AnyEntry = z.discriminatedUnion("id", [
  LearningEntry,
  ErrorEntry,
  FeatureRequestEntry,
])
export type AnyEntry = z.infer<typeof AnyEntry>
