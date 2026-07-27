import path from "path"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { Glob } from "../util/glob"
import {
  LearningEntry,
  ErrorEntry,
  FeatureRequestEntry,
  SkillCandidate,
  LearningStatus,
  generateLearningId,
  generateErrorId,
  generateFeatureId,
  generateCandidateId,
} from "./types"

const log = Log.create({ service: "learning.storage" })

/**
 * Learning storage module for managing learning entries in Markdown format
 * Following patterns from src/util/filesystem.ts and src/config/markdown.ts
 */
export namespace LearningStorage {
  // ============================================================================
  // Directory Paths
  // ============================================================================

  /**
   * Get the learnings directory path
   */
  export function getLearningsDir(scope: "project" | "global" = "project"): string {
    if (scope === "global") {
      return path.join(Global.Path.home, ".dicode", ".learnings")
    }
    return path.join(Instance.directory, ".dicode", ".learnings")
  }

  /**
   * Get the candidates directory path
   */
  export function getCandidatesDir(scope: "project" | "global" = "project"): string {
    return path.join(getLearningsDir(scope), "CANDIDATES")
  }

  /**
   * Ensure the learnings directory exists
   */
  export async function ensureLearningsDir(scope: "project" | "global" = "project"): Promise<string> {
    const dir = getLearningsDir(scope)
    if (!(await Filesystem.isDir(dir))) {
      // Create parent directories first
      const costrictDir = path.dirname(dir)
      if (!(await Filesystem.isDir(costrictDir))) {
        const parentDir = path.dirname(costrictDir)
        if (!(await Filesystem.isDir(parentDir))) {
          // This shouldn't happen for project scope, but handle it anyway
          const { mkdir } = await import("fs/promises")
          await mkdir(parentDir, { recursive: true })
        }
      }
      const { mkdir } = await import("fs/promises")
      await mkdir(dir, { recursive: true })
      log.info("created learnings directory", { dir })
    }
    return dir
  }

  // ============================================================================
  // Learning Entries
  // ============================================================================

  /**
   * Append a learning entry to LEARNINGS.md
   */
  export async function appendLearning(entry: LearningEntry, scope: "project" | "global" = "project"): Promise<void> {
    await ensureLearningsDir(scope)
    const filePath = path.join(getLearningsDir(scope), "LEARNINGS.md")
    const content = formatLearningEntry(entry)

    // Check if file exists and has content
    let existing = ""
    if (await Filesystem.exists(filePath)) {
      existing = await Filesystem.readText(filePath)
      // Remove trailing newline if present
      if (existing.endsWith("\n")) {
        existing = existing.slice(0, -1)
      }
    } else {
      // Add header for new file
      existing = `# Learnings Log

Captured learnings, corrections, and discoveries. Review before major tasks.

---
`
    }

    await Filesystem.write(filePath, existing + "\n" + content + "\n")
    log.info("appended learning entry", { id: entry.id, file: filePath })
  }

  /**
   * Create a new learning entry with generated ID
   */
  export async function createLearning(
    input: Omit<LearningEntry, "id" | "logged" | "recurrenceCount" | "firstSeen" | "lastSeen"> &
      Partial<Pick<LearningEntry, "recurrenceCount" | "firstSeen" | "lastSeen">>,
    scope: "project" | "global" = "project",
  ): Promise<LearningEntry> {
    const now = new Date().toISOString()
    const entry: LearningEntry = {
      id: generateLearningId(),
      logged: now,
      recurrenceCount: 1,
      firstSeen: now,
      lastSeen: now,
      ...input,
    }

    // Check for existing similar learning
    if (entry.patternKey) {
      const existing = await findLearningByPatternKey(entry.patternKey, scope)
      if (existing) {
        // Update recurrence count instead of creating new entry
        const updated: LearningEntry = {
          ...existing,
          recurrenceCount: existing.recurrenceCount + 1,
          lastSeen: now,
          priority: entry.priority, // Use latest priority
        }
        await updateLearning(updated, scope)
        return updated
      }
    }

    await appendLearning(entry, scope)
    return entry
  }

  /**
   * List all learning entries
   */
  export async function listLearnings(
    filter?: {
      status?: LearningStatus
      category?: string
    },
    scope: "project" | "global" = "project",
  ): Promise<LearningEntry[]> {
    const filePath = path.join(getLearningsDir(scope), "LEARNINGS.md")
    if (!(await Filesystem.exists(filePath))) {
      return []
    }

    const content = await Filesystem.readText(filePath)
    return parseLearningsFile(content, filter)
  }

  /**
   * Find a learning entry by pattern key
   */
  export async function findLearningByPatternKey(
    patternKey: string,
    scope: "project" | "global" = "project",
  ): Promise<LearningEntry | undefined> {
    const learnings = await listLearnings(undefined, scope)
    return learnings.find((l) => l.patternKey === patternKey)
  }

  /**
   * Update a learning entry (rewrites the entire file)
   */
  export async function updateLearning(entry: LearningEntry, scope: "project" | "global" = "project"): Promise<void> {
    const learnings = await listLearnings(undefined, scope)
    const index = learnings.findIndex((l) => l.id === entry.id)
    if (index === -1) {
      throw new Error(`Learning entry not found: ${entry.id}`)
    }
    learnings[index] = entry
    await writeLearningsFile(learnings, scope)
    log.info("updated learning entry", { id: entry.id })
  }

  // ============================================================================
  // Error Entries
  // ============================================================================

  /**
   * Append an error entry to ERRORS.md
   */
  export async function appendError(entry: ErrorEntry, scope: "project" | "global" = "project"): Promise<void> {
    await ensureLearningsDir(scope)
    const filePath = path.join(getLearningsDir(scope), "ERRORS.md")
    const content = formatErrorEntry(entry)

    let existing = ""
    if (await Filesystem.exists(filePath)) {
      existing = await Filesystem.readText(filePath)
      if (existing.endsWith("\n")) {
        existing = existing.slice(0, -1)
      }
    } else {
      existing = `# Errors Log

Command failures and exceptions. Log errors for pattern detection.

---
`
    }

    await Filesystem.write(filePath, existing + "\n" + content + "\n")
    log.info("appended error entry", { id: entry.id, file: filePath })
  }

  /**
   * Create a new error entry with generated ID
   */
  export async function createError(
    input: Omit<ErrorEntry, "id" | "logged" | "reproducible"> &
      Partial<Pick<ErrorEntry, "reproducible">>,
    scope: "project" | "global" = "project",
  ): Promise<ErrorEntry> {
    const entry: ErrorEntry = {
      id: generateErrorId(),
      logged: new Date().toISOString(),
      reproducible: "unknown",
      ...input,
    }
    await appendError(entry, scope)
    return entry
  }

  /**
   * List all error entries
   */
  export async function listErrors(scope: "project" | "global" = "project"): Promise<ErrorEntry[]> {
    const filePath = path.join(getLearningsDir(scope), "ERRORS.md")
    if (!(await Filesystem.exists(filePath))) {
      return []
    }
    const content = await Filesystem.readText(filePath)
    return parseErrorsFile(content)
  }

  // ============================================================================
  // Feature Request Entries
  // ============================================================================

  /**
   * Append a feature request entry to FEATURE_REQUESTS.md
   */
  export async function appendFeatureRequest(
    entry: FeatureRequestEntry,
    scope: "project" | "global" = "project",
  ): Promise<void> {
    await ensureLearningsDir(scope)
    const filePath = path.join(getLearningsDir(scope), "FEATURE_REQUESTS.md")
    const content = formatFeatureEntry(entry)

    let existing = ""
    if (await Filesystem.exists(filePath)) {
      existing = await Filesystem.readText(filePath)
      if (existing.endsWith("\n")) {
        existing = existing.slice(0, -1)
      }
    } else {
      existing = `# Feature Requests

User-requested capabilities and features. Track for skill generation.

---
`
    }

    await Filesystem.write(filePath, existing + "\n" + content + "\n")
    log.info("appended feature request entry", { id: entry.id, file: filePath })
  }

  /**
   * Create a new feature request entry with generated ID
   */
  export async function createFeatureRequest(
    input: Omit<FeatureRequestEntry, "id" | "logged">,
    scope: "project" | "global" = "project",
  ): Promise<FeatureRequestEntry> {
    const entry: FeatureRequestEntry = {
      id: generateFeatureId(),
      logged: new Date().toISOString(),
      ...input,
    }
    await appendFeatureRequest(entry, scope)
    return entry
  }

  /**
   * List all feature request entries
   */
  export async function listFeatureRequests(
    scope: "project" | "global" = "project",
  ): Promise<FeatureRequestEntry[]> {
    const filePath = path.join(getLearningsDir(scope), "FEATURE_REQUESTS.md")
    if (!(await Filesystem.exists(filePath))) {
      return []
    }
    const content = await Filesystem.readText(filePath)
    return parseFeaturesFile(content)
  }

  /**
   * Get a feature request by ID
   */
  export async function getFeatureRequest(id: string, scope: "project" | "global" = "project"): Promise<FeatureRequestEntry | undefined> {
    const features = await listFeatureRequests(scope)
    return features.find((f) => f.id === id)
  }

  // ============================================================================
  // Skill Candidates
  // ============================================================================

  /**
   * Save a skill candidate
   */
  export async function saveCandidate(
    candidate: SkillCandidate,
    scope: "project" | "global" = "project",
  ): Promise<string> {
    const candidatesDir = getCandidatesDir(scope)

    // Ensure directory exists
    const { mkdir } = await import("fs/promises")
    await mkdir(candidatesDir, { recursive: true })

    const candidateDir = path.join(candidatesDir, candidate.id)
    await mkdir(candidateDir, { recursive: true })

    // Save SKILL.md
    const skillPath = path.join(candidateDir, "SKILL.md")
    const skillContent = `---
name: ${candidate.name}
description: "${candidate.description}"
---

${candidate.content}
`
    await Filesystem.write(skillPath, skillContent)

    // Save metadata.json
    const metaPath = path.join(candidateDir, "metadata.json")
    await Filesystem.writeJson(metaPath, candidate)

    log.info("saved skill candidate", { id: candidate.id, dir: candidateDir })
    return candidateDir
  }

  /**
   * Create a new skill candidate
   */
  export async function createCandidate(
    input: Omit<SkillCandidate, "id" | "createdAt" | "pushStatus">,
    scope: "project" | "global" = "project",
  ): Promise<SkillCandidate> {
    const candidate: SkillCandidate = {
      id: generateCandidateId(),
      createdAt: new Date().toISOString(),
      pushStatus: "local_only",
      ...input,
    }
    await saveCandidate(candidate, scope)
    return candidate
  }

  /**
   * List all skill candidates
   */
  export async function listCandidates(
    filter?: {
      status?: string
    },
    scope: "project" | "global" = "project",
  ): Promise<SkillCandidate[]> {
    const candidatesDir = getCandidatesDir(scope)
    if (!(await Filesystem.isDir(candidatesDir))) {
      return []
    }

    const candidates: SkillCandidate[] = []
    const matches = await Glob.scan("*/metadata.json", {
      cwd: candidatesDir,
      absolute: true,
      include: "file",
    })

    for (const match of matches) {
      try {
        const candidate = await Filesystem.readJson<SkillCandidate>(match)
        if (!filter?.status || candidate.status === filter.status) {
          candidates.push(candidate)
        }
      } catch (err) {
        log.warn("failed to read candidate metadata", { path: match, err })
      }
    }

    // Sort by creation date, newest first
    candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return candidates
  }

  /**
   * Get a skill candidate by ID
   */
  export async function getCandidate(id: string, scope: "project" | "global" = "project"): Promise<SkillCandidate | undefined> {
    const metaPath = path.join(getCandidatesDir(scope), id, "metadata.json")
    if (!(await Filesystem.exists(metaPath))) {
      return undefined
    }
    return Filesystem.readJson<SkillCandidate>(metaPath)
  }

  /**
   * Update a skill candidate's status
   */
  export async function updateCandidateStatus(
    id: string,
    status: SkillCandidate["status"],
    updates?: Partial<SkillCandidate>,
    scope: "project" | "global" = "project",
  ): Promise<void> {
    const candidate = await getCandidate(id, scope)
    if (!candidate) {
      throw new Error(`Candidate not found: ${id}`)
    }

    const updated: SkillCandidate = {
      ...candidate,
      status,
      ...updates,
    }
    await saveCandidate(updated, scope)
    log.info("updated candidate status", { id, status })
  }

  /**
   * Update a skill candidate's push status
   */
  export async function updateCandidatePushStatus(
    id: string,
    pushStatus: SkillCandidate["pushStatus"],
    updates?: {
      pushedAt?: string
      remoteId?: string
      remoteUrl?: string
    },
    scope: "project" | "global" = "project",
  ): Promise<void> {
    const candidate = await getCandidate(id, scope)
    if (!candidate) {
      throw new Error(`Candidate not found: ${id}`)
    }

    const updated: SkillCandidate = {
      ...candidate,
      pushStatus,
      pushedAt: updates?.pushedAt,
      remoteId: updates?.remoteId,
      remoteUrl: updates?.remoteUrl,
    }

    // Also update status to "pushed" if push was successful
    if (pushStatus === "pushed" && candidate.status !== "approved") {
      updated.status = "approved"
    }

    await saveCandidate(updated, scope)
    log.info("updated candidate push status", { id, pushStatus })
  }

  /**
   * Delete a skill candidate
   */
  export async function deleteCandidate(id: string, scope: "project" | "global" = "project"): Promise<void> {
    const candidateDir = path.join(getCandidatesDir(scope), id)
    const { rm } = await import("fs/promises")
    await rm(candidateDir, { recursive: true, force: true })
    log.info("deleted skill candidate", { id })
  }

  // ============================================================================
  // Markdown Formatting
  // ============================================================================

  function formatLearningEntry(entry: LearningEntry): string {
    const lines: string[] = []

    lines.push(`## [${entry.id}] ${entry.category}`)
    lines.push("")
    lines.push(`**Logged**: ${entry.logged}`)
    lines.push(`**Priority**: ${entry.priority}`)
    lines.push(`**Status**: ${entry.status}`)
    lines.push(`**Area**: ${entry.area}`)
    lines.push("")
    lines.push("### Summary")
    lines.push(entry.summary)
    lines.push("")
    lines.push("### Details")
    lines.push(entry.details)
    lines.push("")

    if (entry.suggestedAction) {
      lines.push("### Suggested Action")
      lines.push(entry.suggestedAction)
      lines.push("")
    }

    lines.push("### Metadata")
    lines.push(`- Source: ${entry.source}`)
    if (entry.relatedFiles?.length) {
      lines.push(`- Related Files: ${entry.relatedFiles.join(", ")}`)
    }
    if (entry.tags?.length) {
      lines.push(`- Tags: ${entry.tags.join(", ")}`)
    }
    if (entry.patternKey) {
      lines.push(`- Pattern-Key: ${entry.patternKey}`)
    }
    lines.push(`- Recurrence-Count: ${entry.recurrenceCount}`)
    if (entry.firstSeen) {
      lines.push(`- First-Seen: ${entry.firstSeen}`)
    }
    if (entry.lastSeen) {
      lines.push(`- Last-Seen: ${entry.lastSeen}`)
    }
    if (entry.skillPath) {
      lines.push(`- Skill-Path: ${entry.skillPath}`)
    }

    lines.push("")
    lines.push("---")
    lines.push("")

    return lines.join("\n")
  }

  function formatErrorEntry(entry: ErrorEntry): string {
    const lines: string[] = []

    lines.push(`## [${entry.id}]`)
    lines.push("")
    lines.push(`**Logged**: ${entry.logged}`)
    lines.push(`**Priority**: ${entry.priority}`)
    lines.push(`**Status**: ${entry.status}`)
    lines.push("")
    lines.push("### Summary")
    lines.push(entry.summary)
    lines.push("")
    lines.push("### Error")
    lines.push("```")
    lines.push(entry.error)
    lines.push("```")
    lines.push("")
    lines.push("### Context")
    lines.push(entry.context)
    lines.push("")

    if (entry.suggestedFix) {
      lines.push("### Suggested Fix")
      lines.push(entry.suggestedFix)
      lines.push("")
    }

    lines.push("### Metadata")
    lines.push(`- Reproducible: ${entry.reproducible}`)
    if (entry.relatedFiles?.length) {
      lines.push(`- Related Files: ${entry.relatedFiles.join(", ")}`)
    }

    if (entry.resolution) {
      lines.push("")
      lines.push("### Resolution")
      lines.push(`- Resolved At: ${entry.resolution.resolvedAt}`)
      lines.push(`- Solution: ${entry.resolution.solution}`)
      if (entry.resolution.commitOrPR) {
        lines.push(`- Commit/PR: ${entry.resolution.commitOrPR}`)
      }
    }

    lines.push("")
    lines.push("---")
    lines.push("")

    return lines.join("\n")
  }

  function formatFeatureEntry(entry: FeatureRequestEntry): string {
    const lines: string[] = []

    lines.push(`## [${entry.id}]`)
    lines.push("")
    lines.push(`**Logged**: ${entry.logged}`)
    lines.push(`**Priority**: ${entry.priority}`)
    lines.push(`**Status**: ${entry.status}`)
    lines.push("")
    lines.push("### Capability")
    lines.push(entry.capability)
    lines.push("")
    lines.push("### User Context")
    lines.push(entry.userContext)
    lines.push("")
    lines.push(`**Complexity**: ${entry.complexity}`)
    lines.push(`**Frequency**: ${entry.frequency}`)

    if (entry.suggestedImplementation) {
      lines.push("")
      lines.push("### Suggested Implementation")
      lines.push(entry.suggestedImplementation)
    }

    if (entry.relatedFeatures?.length) {
      lines.push("")
      lines.push(`**Related Features**: ${entry.relatedFeatures.join(", ")}`)
    }

    lines.push("")
    lines.push("---")
    lines.push("")

    return lines.join("\n")
  }

  // ============================================================================
  // Markdown Parsing
  // ============================================================================

  function parseLearningsFile(content: string, filter?: { status?: LearningStatus; category?: string }): LearningEntry[] {
    const entries: LearningEntry[] = []
    const sections = content.split(/^---$/m).filter((s) => s.trim())

    for (const section of sections) {
      // Skip header section
      if (section.includes("# Learnings Log")) continue

      const entry = parseLearningSection(section.trim())
      if (entry) {
        if (filter?.status && entry.status !== filter.status) continue
        if (filter?.category && entry.category !== filter.category) continue
        entries.push(entry)
      }
    }

    return entries
  }

  function parseLearningSection(section: string): LearningEntry | null {
    try {
      const lines = section.split("\n")
      let id = ""
      let category: LearningEntry["category"] = "correction"
      let logged = ""
      let priority: LearningEntry["priority"] = "medium"
      let status: LearningEntry["status"] = "pending"
      let area: LearningEntry["area"] = "general"
      let summary = ""
      let details = ""
      let suggestedAction: string | undefined
      let source: LearningEntry["source"] = "conversation"
      let relatedFiles: string[] = []
      let tags: string[] = []
      let patternKey: string | undefined
      let recurrenceCount = 1
      let firstSeen: string | undefined
      let lastSeen: string | undefined
      let skillPath: string | undefined

      let currentSection = ""

      for (const line of lines) {
        const trimmed = line.trim()

        // Parse header: ## [LRN-YYYYMMDD-XXX] category
        const headerMatch = trimmed.match(/^## \[([A-Z]{3}-\d{8}-[A-Z0-9]{3})\]\s*(\w+)?/)
        if (headerMatch) {
          id = headerMatch[1]
          if (headerMatch[2]) {
            category = headerMatch[2] as LearningEntry["category"]
          }
          continue
        }

        // Parse metadata fields
        if (trimmed.startsWith("**Logged**:")) {
          logged = trimmed.replace("**Logged**:", "").trim()
          continue
        }
        if (trimmed.startsWith("**Priority**:")) {
          priority = trimmed.replace("**Priority**:", "").trim() as LearningEntry["priority"]
          continue
        }
        if (trimmed.startsWith("**Status**:")) {
          status = trimmed.replace("**Status**:", "").trim() as LearningEntry["status"]
          continue
        }
        if (trimmed.startsWith("**Area**:")) {
          area = trimmed.replace("**Area**:", "").trim() as LearningEntry["area"]
          continue
        }

        // Parse sections
        if (trimmed === "### Summary") {
          currentSection = "summary"
          continue
        }
        if (trimmed === "### Details") {
          currentSection = "details"
          continue
        }
        if (trimmed === "### Suggested Action") {
          currentSection = "suggestedAction"
          continue
        }
        if (trimmed === "### Metadata") {
          currentSection = "metadata"
          continue
        }

        // Parse section content
        if (currentSection === "summary" && trimmed) {
          summary = trimmed
        }
        if (currentSection === "details" && trimmed) {
          details = details ? details + "\n" + trimmed : trimmed
        }
        if (currentSection === "suggestedAction" && trimmed) {
          suggestedAction = suggestedAction ? suggestedAction + "\n" + trimmed : trimmed
        }
        if (currentSection === "metadata") {
          if (trimmed.startsWith("- Source:")) {
            source = trimmed.replace("- Source:", "").trim() as LearningEntry["source"]
          } else if (trimmed.startsWith("- Related Files:")) {
            relatedFiles = trimmed
              .replace("- Related Files:", "")
              .split(",")
              .map((s) => s.trim())
          } else if (trimmed.startsWith("- Tags:")) {
            tags = trimmed
              .replace("- Tags:", "")
              .split(",")
              .map((s) => s.trim())
          } else if (trimmed.startsWith("- Pattern-Key:")) {
            patternKey = trimmed.replace("- Pattern-Key:", "").trim()
          } else if (trimmed.startsWith("- Recurrence-Count:")) {
            recurrenceCount = parseInt(trimmed.replace("- Recurrence-Count:", "").trim(), 10)
          } else if (trimmed.startsWith("- First-Seen:")) {
            firstSeen = trimmed.replace("- First-Seen:", "").trim()
          } else if (trimmed.startsWith("- Last-Seen:")) {
            lastSeen = trimmed.replace("- Last-Seen:", "").trim()
          } else if (trimmed.startsWith("- Skill-Path:")) {
            skillPath = trimmed.replace("- Skill-Path:", "").trim()
          }
        }
      }

      if (!id || !summary) return null

      return {
        id,
        category,
        logged,
        priority,
        status,
        area,
        summary,
        details,
        suggestedAction,
        source,
        relatedFiles: relatedFiles.length > 0 ? relatedFiles : undefined,
        tags: tags.length > 0 ? tags : undefined,
        patternKey,
        recurrenceCount,
        firstSeen,
        lastSeen,
        skillPath,
      }
    } catch {
      return null
    }
  }

  function parseErrorsFile(content: string): ErrorEntry[] {
    const entries: ErrorEntry[] = []
    const sections = content.split(/^---$/m).filter((s) => s.trim())

    for (const section of sections) {
      if (section.includes("# Errors Log")) continue
      const entry = parseErrorSection(section.trim())
      if (entry) entries.push(entry)
    }

    return entries
  }

  function parseErrorSection(section: string): ErrorEntry | null {
    try {
      const lines = section.split("\n")
      let id = ""
      let logged = ""
      let priority: ErrorEntry["priority"] = "medium"
      let status: ErrorEntry["status"] = "pending"
      let summary = ""
      let error = ""
      let context = ""
      let suggestedFix: string | undefined
      let reproducible: ErrorEntry["reproducible"] = "unknown"
      let relatedFiles: string[] = []

      let currentSection = ""
      let inCodeBlock = false

      for (const line of lines) {
        const trimmed = line.trim()

        const headerMatch = trimmed.match(/^## \[([A-Z]{3}-\d{8}-[A-Z0-9]{3})\]/)
        if (headerMatch) {
          id = headerMatch[1]
          continue
        }

        if (trimmed.startsWith("**Logged**:")) {
          logged = trimmed.replace("**Logged**:", "").trim()
          continue
        }
        if (trimmed.startsWith("**Priority**:")) {
          priority = trimmed.replace("**Priority**:", "").trim() as ErrorEntry["priority"]
          continue
        }
        if (trimmed.startsWith("**Status**:")) {
          status = trimmed.replace("**Status**:", "").trim() as ErrorEntry["status"]
          continue
        }

        if (trimmed === "### Summary") {
          currentSection = "summary"
          continue
        }
        if (trimmed === "### Error") {
          currentSection = "error"
          continue
        }
        if (trimmed === "### Context") {
          currentSection = "context"
          continue
        }
        if (trimmed === "### Suggested Fix") {
          currentSection = "suggestedFix"
          continue
        }
        if (trimmed === "### Metadata") {
          currentSection = "metadata"
          continue
        }

        if (trimmed === "```") {
          inCodeBlock = !inCodeBlock
          continue
        }

        if (currentSection === "summary" && trimmed && !inCodeBlock) {
          summary = trimmed
        }
        if (currentSection === "error" && trimmed && inCodeBlock) {
          error = error ? error + "\n" + trimmed : trimmed
        }
        if (currentSection === "context" && trimmed) {
          context = context ? context + "\n" + trimmed : trimmed
        }
        if (currentSection === "suggestedFix" && trimmed) {
          suggestedFix = suggestedFix ? suggestedFix + "\n" + trimmed : trimmed
        }
        if (currentSection === "metadata") {
          if (trimmed.startsWith("- Reproducible:")) {
            reproducible = trimmed.replace("- Reproducible:", "").trim() as ErrorEntry["reproducible"]
          } else if (trimmed.startsWith("- Related Files:")) {
            relatedFiles = trimmed
              .replace("- Related Files:", "")
              .split(",")
              .map((s) => s.trim())
          }
        }
      }

      if (!id || !summary) return null

      return {
        id,
        logged,
        priority,
        status,
        summary,
        error,
        context,
        suggestedFix,
        reproducible,
        relatedFiles: relatedFiles.length > 0 ? relatedFiles : undefined,
      }
    } catch {
      return null
    }
  }

  function parseFeaturesFile(content: string): FeatureRequestEntry[] {
    const entries: FeatureRequestEntry[] = []
    const sections = content.split(/^---$/m).filter((s) => s.trim())

    for (const section of sections) {
      if (section.includes("# Feature Requests")) continue
      const entry = parseFeatureSection(section.trim())
      if (entry) entries.push(entry)
    }

    return entries
  }

  function parseFeatureSection(section: string): FeatureRequestEntry | null {
    try {
      const lines = section.split("\n")
      let id = ""
      let logged = ""
      let priority: FeatureRequestEntry["priority"] = "medium"
      let status: FeatureRequestEntry["status"] = "pending"
      let capability = ""
      let userContext = ""
      let complexity: FeatureRequestEntry["complexity"] = "medium"
      let frequency: FeatureRequestEntry["frequency"] = "first_time"
      let suggestedImplementation: string | undefined

      let currentSection = ""

      for (const line of lines) {
        const trimmed = line.trim()

        const headerMatch = trimmed.match(/^## \[([A-Z]{4}-\d{8}-[A-Z0-9]{3})\]/)
        if (headerMatch) {
          id = headerMatch[1]
          continue
        }

        if (trimmed.startsWith("**Logged**:")) {
          logged = trimmed.replace("**Logged**:", "").trim()
          continue
        }
        if (trimmed.startsWith("**Priority**:")) {
          priority = trimmed.replace("**Priority**:", "").trim() as FeatureRequestEntry["priority"]
          continue
        }
        if (trimmed.startsWith("**Status**:")) {
          status = trimmed.replace("**Status**:", "").trim() as FeatureRequestEntry["status"]
          continue
        }
        if (trimmed.startsWith("**Complexity**:")) {
          complexity = trimmed.replace("**Complexity**:", "").trim() as FeatureRequestEntry["complexity"]
          continue
        }
        if (trimmed.startsWith("**Frequency**:")) {
          frequency = trimmed.replace("**Frequency**:", "").trim() as FeatureRequestEntry["frequency"]
          continue
        }

        if (trimmed === "### Capability") {
          currentSection = "capability"
          continue
        }
        if (trimmed === "### User Context") {
          currentSection = "userContext"
          continue
        }
        if (trimmed === "### Suggested Implementation") {
          currentSection = "suggestedImplementation"
          continue
        }

        if (currentSection === "capability" && trimmed) {
          capability = trimmed
        }
        if (currentSection === "userContext" && trimmed) {
          userContext = userContext ? userContext + "\n" + trimmed : trimmed
        }
        if (currentSection === "suggestedImplementation" && trimmed) {
          suggestedImplementation = suggestedImplementation ? suggestedImplementation + "\n" + trimmed : trimmed
        }
      }

      if (!id || !capability) return null

      return {
        id,
        logged,
        priority,
        status,
        capability,
        userContext,
        complexity,
        frequency,
        suggestedImplementation,
      }
    } catch {
      return null
    }
  }

  async function writeLearningsFile(learnings: LearningEntry[], scope: "project" | "global"): Promise<void> {
    const filePath = path.join(getLearningsDir(scope), "LEARNINGS.md")
    let content = `# Learnings Log

Captured learnings, corrections, and discoveries. Review before major tasks.

---
`
    for (const entry of learnings) {
      content += "\n" + formatLearningEntry(entry)
    }
    await Filesystem.write(filePath, content)
  }
}
