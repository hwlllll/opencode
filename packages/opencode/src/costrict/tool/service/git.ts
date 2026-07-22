import path from "path"
import fs from "fs/promises"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import { existsSync } from "fs"
import type { SimpleGit } from "simple-git"
import { simpleGit, CheckRepoActions } from "simple-git"

const log = Log.create({ service: "git-service" })

export interface CommitInfo {
  hash: string
  message: string
  date: string
}

export class GitService {
  private shadowRepoPath: string
  private projectRoot: string
  private available: boolean = false

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
    // Create a hash of the project path to use as the shadow repo directory name
    const projectHash = this.hashProjectPath(projectRoot)
    this.shadowRepoPath = path.join(Global.Path.data, "checkpoint", projectHash)
  }

  private hashProjectPath(projectPath: string): string {
    // Simple hash function using Bun's built-in hashing
    const normalized = path.normalize(projectPath).toLowerCase()
    return Bun.hash(normalized).toString(36)
  }

  /**
   * Initialize the shadow Git repository
   */
  async initialize(): Promise<void> {
    try {
      // Check if git is available
      await this.checkGitAvailable()

      // Create shadow repo directory
      await fs.mkdir(this.shadowRepoPath, { recursive: true })

      // Check if already initialized
      const gitDir = path.join(this.shadowRepoPath, ".git")
      if (existsSync(gitDir)) {
        log.info("Shadow repository already initialized", { path: this.shadowRepoPath })
        this.available = true
        return
      }

      // Create dedicated .gitconfig for shadow repo
      const gitConfig = path.join(this.shadowRepoPath, ".gitconfig")
      await fs.writeFile(
        gitConfig,
        `[user]
\tname = Costrict Cli
\temail = zgsm@sangfor.com.cn
[commit]
\tgpgsign = false
[core]
\tautocrlf = false
`,
      )

      log.info("Initializing shadow repository", { path: this.shadowRepoPath })

      const repo = simpleGit(this.shadowRepoPath)
      let isRepoDefined = false
      try {
        isRepoDefined = await repo.checkIsRepo(CheckRepoActions.IS_REPO_ROOT)
      } catch (error) {
        // If checkIsRepo fails (e.g., on certain Git versions like macOS 2.39.5),
        // log the error and assume repo is not defined, then proceed with initialization
        log.debug(
          `checkIsRepo failed, will initialize repository: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      if (!isRepoDefined) {
        try {
          // Try to initialize with --initial-branch option (Git 2.28.0+)
          await repo.init(false, {
            "--initial-branch": "main",
          })
        } catch (error) {
          // Fallback for older Git versions that don't support --initial-branch
          log.debug(
            `init with --initial-branch failed, using fallback: ${error instanceof Error ? error.message : String(error)}`,
          )
          await repo.init(false)
          // For older Git versions, we need to rename the default branch to 'main'
          // But we can only do this after creating the first commit
        }

        // After git init, use shadowGitRepository to add files from project root
        const shadowRepo = this.shadowGitRepository

        // Add all files from the project
        await shadowRepo.add(".")

        // Create initial commit with all files (allow empty in case no files were added)
        await shadowRepo.commit("Initial commit", { "--allow-empty": null })

        // Ensure we're on 'main' branch for older Git versions
        try {
          const currentBranch = await repo.raw(["branch", "--show-current"])
          if (currentBranch.trim() !== "main") {
            await repo.raw(["branch", "-M", "main"])
          }
        } catch (error) {
          // If renaming fails, log but don't fail initialization
          log.debug(
            `Failed to rename branch to main: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      // Copy .gitignore from project root if exists
      const projectGitignore = path.join(this.projectRoot, ".gitignore")
      if (existsSync(projectGitignore)) {
        const shadowGitignore = path.join(this.shadowRepoPath, ".gitignore")
        await fs.copyFile(projectGitignore, shadowGitignore)
      }

      this.available = true
      log.info("Shadow repository initialized successfully")
    } catch (error) {
      // Don't throw error, just log warning so CLI can continue to work
      log.warn("Checkpoint feature unavailable", {
        error: error instanceof Error ? error.message : String(error),
        hint: "Git is required for checkpoint functionality. Install Git to enable this feature.",
      })
      this.available = false
    }
  }

  private async checkGitAvailable(): Promise<void> {
    try {
      await simpleGit().raw(["--version"])
    } catch (error) {
      throw new Error("Git is not installed or not available in PATH")
    }
  }

  private async ensureAvailable(): Promise<void> {
    if (!this.available) {
      // Try to initialize if not available
      log.info("Git service not available, attempting to initialize...")
      await this.initialize()

      // Check again after initialization
      if (!this.available) {
        throw new Error("Checkpoint feature is unavailable. Git is required for this functionality.")
      }
    }
  }

  /**
   * Get the shadow git repository instance
   */
  private get shadowGitRepository(): SimpleGit {
    return simpleGit(this.projectRoot).env({
      GIT_DIR: path.join(this.shadowRepoPath, ".git"),
      GIT_WORK_TREE: this.projectRoot,
      // Prevent git from using the user's global git config.
      HOME: this.shadowRepoPath,
      XDG_CONFIG_HOME: this.shadowRepoPath,
    })
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommitHash(): Promise<string> {
    try {
      const hash = await this.shadowGitRepository.raw("rev-parse", "HEAD")
      return hash.trim()
    } catch (error) {
      log.warn("Could not get current commit hash", { error })
      return ""
    }
  }

  /**
   * Create a checkpoint (snapshot) of the current project state
   */
  async createCheckpoint(message: string): Promise<string> {
    await this.ensureAvailable()
    try {
      const repo = this.shadowGitRepository

      // Stage all changes
      await repo.add(".")

      // Check if there are any changes to commit
      const status = await repo.status()
      if (status.isClean()) {
        log.info("No changes to checkpoint")
        return await this.getCurrentCommitHash()
      }

      // Create commit
      const commitResult = await repo.commit(message, {
        "--no-verify": null,
      })

      const hash = commitResult.commit
      log.info("Checkpoint created", { hash, message })
      return hash
    } catch (error) {
      log.error("Failed to create checkpoint", { message, error })
      throw new Error(`Failed to create checkpoint: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Get list of all checkpoints
   */
  async listCheckpoints(limit: number = 50): Promise<CommitInfo[]> {
    this.ensureAvailable()
    try {
      const repo = this.shadowGitRepository
      const logResult = await repo.log({ maxCount: limit })

      return logResult.all.map((commit) => {
        // Combine message (first line) with body (rest of the message)
        let fullMessage = commit.message
        if (commit.body) {
          fullMessage += "\n" + commit.body
        }

        // Replace newlines with spaces and limit length
        const singleLineMessage = fullMessage
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim()

        const truncatedMessage =
          singleLineMessage.length > 200
            ? singleLineMessage.substring(0, 197) + "..."
            : singleLineMessage

        return {
          hash: commit.hash,
          message: truncatedMessage,
          date: commit.date,
        }
      })
    } catch (error) {
      log.error("Failed to list checkpoints", { error })
      throw new Error(`Failed to list checkpoints: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Show diff for a specific checkpoint
   */
  async showCheckpointDiff(commitHash: string): Promise<string> {
    this.ensureAvailable()
    try {
      const repo = this.shadowGitRepository

      // Get the diff between the commit and its parent
      const diff = await repo.diff([`${commitHash}^`, commitHash])
      return diff
    } catch (error) {
      log.error("Failed to show checkpoint diff", { commitHash, error })
      throw new Error(`Failed to show diff for checkpoint ${commitHash}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Restore project to a specific checkpoint
   */
  async restoreCheckpoint(commitHash: string, files?: string[]): Promise<void> {
    this.ensureAvailable()
    try {
      const repo = this.shadowGitRepository

      // If files are specified, restore only those files; otherwise restore all
      const restorePath = files && files.length > 0 ? files : ["."]
      await repo.raw(["restore", "--source", commitHash, ...restorePath])

      log.info("Restored from checkpoint", { commitHash, files })
    } catch (error) {
      log.error("Failed to restore checkpoint", { commitHash, files, error })
      throw new Error(`Failed to restore checkpoint ${commitHash}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Revert a specific checkpoint (create a new commit that undoes the changes)
   */
  async revertCheckpoint(commitHash: string): Promise<string> {
    this.ensureAvailable()
    try {
      const repo = this.shadowGitRepository

      // Use git revert to create a new commit that undoes the specified commit
      await repo.raw(["revert", "--no-edit", commitHash])

      // Get the hash of the revert commit
      const newHash = await this.getCurrentCommitHash()
      log.info("Checkpoint reverted", { originalHash: commitHash, newHash })
      return newHash
    } catch (error) {
      log.error("Failed to revert checkpoint", { commitHash, error })
      throw new Error(`Failed to revert checkpoint ${commitHash}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Check if shadow repository is initialized
   */
  isInitialized(): boolean {
    const gitDir = path.join(this.shadowRepoPath, ".git")
    return existsSync(gitDir)
  }

  /**
   * Check if the service is available (Git is installed and initialized)
   */
  isAvailable(): boolean {
    return this.available
  }

  /**
   * Get the shadow repository path
   */
  getShadowRepoPath(): string {
    return this.shadowRepoPath
  }
}

// Singleton instance for the current project
let instance: GitService | null = null

export namespace GitService {
  export async function getInstance(): Promise<GitService> {
    if (!instance) {
      instance = new GitService(Instance.directory)
      if (!instance.isInitialized()) {
        await instance.initialize()
      } else {
        // Mark as available if already initialized
        instance["available"] = true
      }
    }
    return instance
  }

  /**
   * Get instance safely, returns null if service is not available
   */
  export async function getInstanceSafe(): Promise<GitService | null> {
    try {
      const service = await getInstance()
      return service.isAvailable() ? service : null
    } catch (error) {
      log.warn("Failed to get GitService instance", { error })
      return null
    }
  }

  export function reset(): void {
    instance = null
  }
}
