import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { LearningStorage } from "@/learning/storage"
import { SkillGenerator } from "@/learning/generator"
import { SkillPusher } from "@/learning/pusher"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"
import { EOL } from "os"
import { Locale } from "@/util/locale"

export const LearningCommand = cmd({
  command: "learning",
  describe: "manage learning entries and skill candidates",
  builder: (yargs: Argv) =>
    yargs
      .command(LearningListCommand)
      .command(LearningShowCommand)
      .command(SkillCandidatesCommand)
      .command(SkillApproveCommand)
      .command(SkillRejectCommand)
      .command(SkillGenerateCommand)
      .command(SkillPushCommand)
      .demandCommand(),
  async handler() {},
})

// ============================================================================
// Learning Commands
// ============================================================================

export const LearningListCommand = cmd({
  command: "list",
  describe: "list all learning entries",
  builder: (yargs: Argv) =>
    yargs
      .option("status", {
        describe: "filter by status",
        type: "string",
        choices: ["pending", "in_progress", "resolved", "promoted", "skill_created"],
      })
      .option("scope", {
        describe: "scope to search",
        type: "string",
        choices: ["project", "global"],
        default: "project",
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const learnings = await LearningStorage.listLearnings(
        args.status ? { status: args.status as any } : undefined,
        args.scope as "project" | "global",
      )

      if (learnings.length === 0) {
        UI.println("No learning entries found.")
        return
      }

      if (args.format === "json") {
        console.log(JSON.stringify(learnings, null, 2))
        return
      }

      console.log(formatLearningsTable(learnings))
      UI.println(`${EOL}Total: ${learnings.length} learning(s)`)
    })
  },
})

function formatLearningsTable(learnings: { id: string; category: string; priority: string; status: string; summary: string }[]): string {
  const lines: string[] = []

  const maxIdWidth = Math.max(18, ...learnings.map((l) => l.id.length))
  const maxCategoryWidth = Math.max(10, ...learnings.map((l) => l.category.length))
  const maxPriorityWidth = Math.max(8, ...learnings.map((l) => l.priority.length))
  const maxStatusWidth = Math.max(10, ...learnings.map((l) => l.status.length))
  const summaryWidth = 40

  const header = `ID${" ".repeat(maxIdWidth - 2)}  Category${" ".repeat(maxCategoryWidth - 8)}  Priority${" ".repeat(maxPriorityWidth - 8)}  Status${" ".repeat(maxStatusWidth - 6)}  Summary`
  lines.push(header)
  lines.push("─".repeat(header.length))

  for (const learning of learnings) {
    const truncatedSummary = Locale.truncate(learning.summary, summaryWidth)
    const line = `${learning.id.padEnd(maxIdWidth)}  ${learning.category.padEnd(maxCategoryWidth)}  ${learning.priority.padEnd(maxPriorityWidth)}  ${learning.status.padEnd(maxStatusWidth)}  ${truncatedSummary}`
    lines.push(line)
  }

  return lines.join(EOL)
}

export const LearningShowCommand = cmd({
  command: "show <id>",
  describe: "show learning entry details",
  builder: (yargs: Argv) =>
    yargs.positional("id", {
      describe: "learning entry ID",
      type: "string",
      demandOption: true,
    }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const learnings = await LearningStorage.listLearnings()
      const learning = learnings.find((l) => l.id === args.id)

      if (!learning) {
        UI.error(`Learning entry not found: ${args.id}`)
        process.exit(1)
      }

      console.log(JSON.stringify(learning, null, 2))
    })
  },
})

// ============================================================================
// Skill Candidate Commands
// ============================================================================

export const SkillCandidatesCommand = cmd({
  command: "candidates",
  describe: "list skill candidates",
  builder: (yargs: Argv) =>
    yargs
      .option("status", {
        describe: "filter by status",
        type: "string",
        choices: ["draft", "review", "approved", "rejected", "pushed"],
      })
      .option("scope", {
        describe: "scope to search",
        type: "string",
        choices: ["project", "global"],
        default: "project",
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const candidates = await LearningStorage.listCandidates(
        args.status ? { status: args.status } : undefined,
        args.scope as "project" | "global",
      )

      if (candidates.length === 0) {
        UI.println("No skill candidates found.")
        return
      }

      if (args.format === "json") {
        console.log(JSON.stringify(candidates, null, 2))
        return
      }

      console.log(formatCandidatesTable(candidates))
      UI.println(`${EOL}Total: ${candidates.length} candidate(s)`)
    })
  },
})

function formatCandidatesTable(candidates: { id: string; name: string; status: string; confidence: number; sourceType: string; createdAt: string }[]): string {
  const lines: string[] = []

  const maxIdWidth = Math.max(36, ...candidates.map((c) => c.id.length))
  const maxNameWidth = Math.max(15, ...candidates.map((c) => c.name.length))
  const maxStatusWidth = Math.max(8, ...candidates.map((c) => c.status.length))
  const maxSourceWidth = Math.max(10, ...candidates.map((c) => c.sourceType.length))

  const header = `ID${" ".repeat(maxIdWidth - 2)}  Name${" ".repeat(maxNameWidth - 4)}  Status${" ".repeat(maxStatusWidth - 6)}  Confidence  Source${" ".repeat(maxSourceWidth - 6)}  Created`
  lines.push(header)
  lines.push("─".repeat(header.length))

  for (const candidate of candidates) {
    const confidence = `${(candidate.confidence * 100).toFixed(0)}%`
    const date = new Date(candidate.createdAt).toLocaleDateString()
    const line = `${candidate.id.padEnd(maxIdWidth)}  ${candidate.name.padEnd(maxNameWidth)}  ${candidate.status.padEnd(maxStatusWidth)}  ${confidence.padStart(10)}  ${candidate.sourceType.padEnd(maxSourceWidth)}  ${date}`
    lines.push(line)
  }

  return lines.join(EOL)
}

export const SkillApproveCommand = cmd({
  command: "approve <id>",
  describe: "approve a skill candidate (creates formal skill)",
  builder: (yargs: Argv) =>
    yargs.positional("id", {
      describe: "candidate ID",
      type: "string",
      demandOption: true,
    }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const skillPath = await SkillGenerator.promoteToSkill(args.id)
      if (skillPath) {
        UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Skill approved and created at: ${skillPath}` + UI.Style.TEXT_NORMAL)
      } else {
        UI.error(`Failed to approve skill candidate: ${args.id}`)
        process.exit(1)
      }
    })
  },
})

export const SkillRejectCommand = cmd({
  command: "reject <id>",
  describe: "reject a skill candidate",
  builder: (yargs: Argv) =>
    yargs
      .positional("id", {
        describe: "candidate ID",
        type: "string",
        demandOption: true,
      })
      .option("reason", {
        describe: "rejection reason",
        type: "string",
      }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      await SkillGenerator.rejectCandidate(args.id, args.reason)
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Skill candidate ${args.id} rejected` + UI.Style.TEXT_NORMAL)
    })
  },
})

export const SkillGenerateCommand = cmd({
  command: "generate [id]",
  describe: "generate skill(s) from learning entries",
  builder: (yargs: Argv) =>
    yargs.positional("id", {
      describe: "learning entry ID (optional, if not provided, generates skills for all pending learnings)",
      type: "string",
    }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const learnings = await LearningStorage.listLearnings()

      // If ID is provided, generate skill for single learning
      if (args.id) {
        const learning = learnings.find((l) => l.id === args.id)

        if (!learning) {
          UI.error(`Learning entry not found: ${args.id}`)
          process.exit(1)
        }

        if (learning.status === "skill_created") {
          UI.println(`Learning ${args.id} has already been converted to a skill`)
          UI.println(`Skill path: ${learning.skillPath || "N/A"}`)
          return
        }

        await generateSingleSkill(learning)
        return
      }

      // No ID provided - generate skills for all pending learnings
      const pendingLearnings = learnings.filter((l) => l.status !== "skill_created")

      if (pendingLearnings.length === 0) {
        UI.println("No pending learnings to convert. All learnings have been converted to skills.")
        return
      }

      UI.println(`Found ${pendingLearnings.length} learning(s) to convert to skills${EOL}`)
      UI.println(UI.Style.TEXT_WARNING + "Note: This operation may take some time depending on the model performance." + UI.Style.TEXT_NORMAL)
      UI.println(`Processing...${EOL}`)

      let successCount = 0
      let skipCount = 0
      let failCount = 0

      for (const learning of pendingLearnings) {
        UI.println(`${EOL}--- Processing [${learning.id}] ---`)
        UI.println(`Category: ${learning.category}`)
        UI.println(`Summary: ${Locale.truncate(learning.summary, 60)}`)

        try {
          const candidate = await SkillGenerator.generateFromLearning(learning)
          if (candidate) {
            UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Skill candidate created: ${candidate.id}` + UI.Style.TEXT_NORMAL)
            successCount++
          } else {
            UI.println(UI.Style.TEXT_WARNING + "Skipped: Could not generate skill candidate" + UI.Style.TEXT_NORMAL)
            skipCount++
          }
        } catch (err) {
          UI.error(`Failed to generate skill: ${err}`)
          failCount++
        }
      }

      UI.println(`${EOL}${EOL}=== Summary ===`)
      UI.println(`Total: ${pendingLearnings.length}`)
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Success: ${successCount}` + UI.Style.TEXT_NORMAL)
      if (skipCount > 0) UI.println(`Skipped: ${skipCount}`)
      if (failCount > 0) UI.println(UI.Style.TEXT_WARNING_BOLD + `Failed: ${failCount}` + UI.Style.TEXT_NORMAL)

      if (successCount > 0) {
        UI.println(`${EOL}Review candidates with: cs learning candidates`)
        UI.println(`Approve a candidate with: cs learning approve <candidate-id>`)
      }
    })
  },
})

/**
 * Generate a skill from a single learning entry
 */
async function generateSingleSkill(learning: any): Promise<void> {
  UI.println(`Generating skill from learning: ${learning.id}`)
  UI.println(`Category: ${learning.category}`)
  UI.println(`Summary: ${Locale.truncate(learning.summary, 60)}`)
  UI.println(`${EOL}Analyzing learning content and generating skill...`)
  UI.println(UI.Style.TEXT_WARNING + "Note: This may take some time depending on the model performance." + UI.Style.TEXT_NORMAL)

  const candidate = await SkillGenerator.generateFromLearning(learning)
  if (candidate) {
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `${EOL}Skill candidate created: ${candidate.id}` + UI.Style.TEXT_NORMAL)
    UI.println(`Name: ${candidate.name}`)
    UI.println(`Description: ${candidate.description}`)
    UI.println(`Confidence: ${(candidate.confidence * 100).toFixed(0)}%`)
    UI.println(`${EOL}Review and approve with: cs learning approve ${candidate.id}`)
  } else {
    UI.error("Failed to generate skill candidate")
    process.exit(1)
  }
}

export const SkillPushCommand = cmd({
  command: "push <id>",
  describe: "push a skill candidate to the CoStrict server",
  builder: (yargs: Argv) =>
    yargs
      .positional("id", {
        describe: "candidate ID",
        type: "string",
        demandOption: true,
      })
      .option("visibility", {
        describe: "visibility of the skill on the server",
        type: "string",
        choices: ["private", "team", "public"],
        default: "private",
      })
      .option("force", {
        describe: "force sync even if the skill was already pushed",
        type: "boolean",
        default: false,
      }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      // Check if server is configured
      const isConfigured = await SkillPusher.isServerConfigured()
      if (!isConfigured) {
        UI.error("Server not configured. Please login first using 'cs auth login'")
        process.exit(1)
      }

      const candidate = await LearningStorage.getCandidate(args.id)
      if (!candidate) {
        UI.error(`Skill candidate not found: ${args.id}`)
        process.exit(1)
      }

      UI.println(
        args.force
          ? `Force syncing skill "${candidate.name}" to server...`
          : `Pushing skill "${candidate.name}" to server...`,
      )

      const result = await SkillPusher.syncToServer(args.id, {
        visibility: args.visibility as "private" | "team" | "public",
        force: args.force,
      })

      if (result.success) {
        const successMessage =
          result.action === "updated"
            ? "Skill synced successfully!"
            : result.action === "repaired"
              ? "Skill metadata repaired successfully!"
              : "Skill pushed successfully!"
        UI.println(UI.Style.TEXT_SUCCESS_BOLD + successMessage + UI.Style.TEXT_NORMAL)
        UI.println(`Remote ID: ${result.remoteId}`)
        UI.println(`Remote URL: ${result.remoteUrl}`)
      } else {
        UI.error(`Failed to push skill: ${result.error}`)
        process.exit(1)
      }
    })
  },
})
