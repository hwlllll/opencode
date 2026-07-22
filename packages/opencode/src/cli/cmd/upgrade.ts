import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "../../installation"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

/**
 * Pre-upgrade environment checks. Returns true if all checks pass.
 */
async function preUpgradeChecks(method: Installation.Method): Promise<boolean> {
  const installDir = path.dirname(process.execPath)
  const isWindows = process.platform === "win32"

  // Check write permission to install directory
  try {
    fs.accessSync(installDir, fs.constants.W_OK)
  } catch {
    if (method === "curl") {
      prompts.log.error(`No write permission to install directory: ${installDir}`)
      if (isWindows) {
        prompts.log.info("Solution: Run the terminal as Administrator and try again")
      } else {
        prompts.log.info(`Solution: Run with sudo or fix permissions: sudo chmod u+w ${installDir}`)
      }
      return false
    }
  }

  // Check disk space (need at least 50MB)
  try {
    if (!isWindows) {
      const dfOutput = execSync(`df -k "${installDir}" | tail -1`, { encoding: "utf-8" })
      const parts = dfOutput.trim().split(/\s+/)
      const availableKB = parseInt(parts[3], 10)
      if (!isNaN(availableKB) && availableKB < 50 * 1024) {
        prompts.log.error(`Insufficient disk space in ${installDir} (available: ${Math.round(availableKB / 1024)}MB, required: 50MB)`)
        prompts.log.info("Solution: Free up disk space and try again")
        return false
      }
    }
  } catch {
    // Non-critical: skip disk space check if df fails
  }

  // Windows: check for conflicting cs processes
  if (isWindows) {
    try {
      const tasklist = execSync("tasklist /FI \"IMAGENAME eq cs.exe\" /FO CSV /NH", { encoding: "utf-8" })
      const runningCount = tasklist.split("\n").filter((line) => line.includes("cs.exe")).length
      // More than 1 means other instances besides the current one
      if (runningCount > 1) {
        prompts.log.warn("Other cs processes are running, which may cause file lock conflicts on Windows")
        prompts.log.info("Solution: Close other cs instances before upgrading")
        const proceed = await prompts.select({
          message: "Continue with upgrade?",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false },
          ],
          initialValue: false,
        })
        if (!proceed) return false
      }
    } catch {
      // Non-critical: skip process check if tasklist fails
    }
  }

  return true
}

/**
 * Post-upgrade verification. Checks that the new version matches the target.
 */
async function postUpgradeVerify(target: string): Promise<void> {
  try {
    const versionOutput = execSync(`"${process.execPath}" --version`, { encoding: "utf-8", timeout: 10000 }).trim()
    // Extract version number (may include prefix like "cs v3.0.18" or just "3.0.18")
    const match = versionOutput.match(/(\d+\.\d+\.\d+)/)
    if (match) {
      const actual = match[1]
      if (actual === target) {
        prompts.log.success(`Successfully upgraded to ${target}`)
      } else {
        prompts.log.warn(`Upgrade may not have completed correctly. Expected ${target}, got ${actual}`)
        prompts.log.info("Try restarting your terminal and running: cs --version")
      }
    } else {
      prompts.log.success(`Upgrade to ${target} completed`)
    }
  } catch {
    // Verification failed, but upgrade command itself succeeded
    prompts.log.success(`Upgrade to ${target} completed`)
    prompts.log.info("Restart your terminal and verify with: cs --version")
  }
}

/**
 * Provide actionable error messages based on failure context.
 */
function handleUpgradeError(err: unknown, method: Installation.Method): void {
  const isWindows = process.platform === "win32"

  if (err instanceof Installation.UpgradeFailedError) {
    const stderr = err.stderr

    // Permission / elevation errors
    if (method === "choco" && stderr.includes("not running from an elevated command shell")) {
      prompts.log.error("Insufficient privileges to run Chocolatey")
      prompts.log.info("Solution: Run the terminal as Administrator and try again")
      return
    }
    if (stderr.includes("EACCES") || stderr.includes("permission denied") || stderr.includes("Permission denied")) {
      prompts.log.error("Permission denied during upgrade")
      if (isWindows) {
        prompts.log.info("Solution: Run the terminal as Administrator and try again")
      } else {
        prompts.log.info("Solution: Try running with sudo, or use: cs upgrade --method=curl")
      }
      return
    }

    // Network errors
    if (
      stderr.includes("ETIMEDOUT") ||
      stderr.includes("ECONNREFUSED") ||
      stderr.includes("ENOTFOUND") ||
      stderr.includes("network") ||
      stderr.includes("fetch failed")
    ) {
      prompts.log.error("Network error during upgrade")
      prompts.log.info("Possible causes:")
      prompts.log.info("  1. No internet connection")
      prompts.log.info("  2. Proxy not configured (check HTTP_PROXY / HTTPS_PROXY)")
      prompts.log.info("  3. Firewall blocking the connection")
      return
    }

    // Package not found
    if (stderr.includes("404") || stderr.includes("not found") || stderr.includes("No formula")) {
      prompts.log.error("Package not found in registry")
      prompts.log.info(`Solution: Try a different install method: cs upgrade --method=curl`)
      return
    }

    // Generic error with stderr
    prompts.log.error(stderr)
  } else if (err instanceof Error) {
    prompts.log.error(err.message)
  }

  // Fallback suggestion
  if (method !== "curl") {
    prompts.log.info(`Tip: You can try upgrading with curl instead: cs upgrade --method=curl`)
  }
}

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "upgrade cs to the latest or a specific version",
  builder: (yargs: Argv) => {
    return yargs
      .positional("target", {
        describe: "version to upgrade to, for ex '0.1.48' or 'v0.1.48'",
        type: "string",
      })
      .option("method", {
        alias: "m",
        describe: "installation method to use",
        type: "string",
        choices: ["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"],
      })
  },
  handler: async (args: { target?: string; method?: string }) => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Upgrade")
    const detectedMethod = await Installation.method()
    const method = (args.method as Installation.Method) ?? detectedMethod
    if (method === "unknown") {
      prompts.log.error(`cs is installed to ${process.execPath} and may be managed by a package manager`)
      const install = await prompts.select({
        message: "Install anyways?",
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
        initialValue: false,
      })
      if (!install) {
        prompts.outro("Done")
        return
      }
    }
    prompts.log.info("Using method: " + method)
    let target: string
    try {
      target = args.target ? args.target.replace(/^v/, "") : await Installation.latest()
    } catch (err) {
      prompts.log.error("Failed to fetch latest version from registry")
      if (err instanceof Error) {
        prompts.log.error(err.message)
      }
      prompts.log.info(
        "Please check your network connection or try specifying a version manually with: cs upgrade <version>",
      )
      prompts.log.info("If behind a proxy, ensure HTTP_PROXY and HTTPS_PROXY environment variables are set")
      prompts.outro("Done")
      return
    }

    if (Installation.VERSION === target) {
      prompts.log.warn(`cs upgrade skipped: ${target} is already installed`)
      prompts.outro("Done")
      return
    }

    // Prevent downgrade
    const versionComparison = Installation.compareVersions(target, Installation.VERSION)
    if (versionComparison < 0) {
      prompts.log.warn(
        `cs upgrade skipped: current version ${Installation.VERSION} is newer than target ${target}. Downgrade is not allowed`,
      )
      prompts.log.info("If you need to use an older version, please reinstall manually")
      prompts.outro("Done")
      return
    }

    // Pre-upgrade environment checks
    const checksOk = await preUpgradeChecks(method)
    if (!checksOk) {
      prompts.outro("Upgrade aborted")
      return
    }

    prompts.log.info(`From ${Installation.VERSION} → ${target}`)
    const spinner = prompts.spinner()
    spinner.start("Upgrading...")
    const err = await Installation.upgrade(method, target).catch((err) => err)
    if (err) {
      spinner.stop("Upgrade failed", 1)
      handleUpgradeError(err, method)
      prompts.outro("Done")
      return
    }
    spinner.stop("Upgrade complete")

    // Post-upgrade verification
    await postUpgradeVerify(target)

    prompts.outro("Done")
  },
}
