/**
 * Learning Module - Client-side Skill Self-Evolution System
 *
 * This module implements a client-first learning system that enables
 * AI to learn from conversations, detect reusable patterns, and
 * progressively promote learnings to skills.
 *
 * @see docs/CLIENT_SIDE_SKILL_EVOLUTION.md
 */

// Re-export types
export * from "./types"

// Re-export events
export { LearningEvent } from "./events"

// Re-export storage
export { LearningStorage } from "./storage"

// Re-export detector (will be implemented)
export { LearningDetector } from "./detector"

// Re-export generator (will be implemented)
export { SkillGenerator } from "./generator"

// Re-export promoter (will be implemented)
export { LearningPromoter } from "./promoter"
