import { CostrictCommand } from "./index"
import type { Command } from "../../command"

/**
 * Learning-related commands
 * This module provides commands for the learning system, allowing decoupled registration.
 */
export namespace LearningCommands {
  export const Default = {
    SKILL_CAPTURE: "skills-capture",
  } as const

  /**
   * Get learning commands to register
   * @param lang - The language for prompts
   * @returns Record of command name to command info
   */
  export function getCommands(lang: string): Record<string, Command.Info> {
    return {
      [Default.SKILL_CAPTURE]: {
        name: Default.SKILL_CAPTURE,
        description: "capture learnings from current conversation",
        source: "command",
        get template() {
          return CostrictCommand.get("skills-capture", lang)
        },
        hints: [], // skills-capture doesn't use positional arguments
      },
    }
  }

  /**
   * List all learning command names
   */
  export function listNames(): string[] {
    return Object.values(Default)
  }
}
