import { Effect, Layer, Schema, ServiceMap, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import * as CrossSpawnSpawner from "@/effect/cross-spawn-spawner"
import { makeRuntime } from "@/effect/run-service"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import path from "path"
import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Flag } from "../flag/flag"
import { Log } from "../util/log"
import { createHash } from "node:crypto"
import { hostname, userInfo } from "node:os"
import Package from "../../package.json"

import semver from "semver"

declare global {
  const COSTRICT_VERSION: string
  const COSTRICT_CHANNEL: string
  const COSTRICT_COMMIT_HASH: string
  const COSTRICT_BUILD_TIME: string
}

export namespace Installation {
  const log = Log.create({ service: "installation" })

  export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"

  export type ReleaseType = "patch" | "minor" | "major"

  export const Event = {
    Updated: BusEvent.define(
      "installation.updated",
      z.object({
        version: z.string(),
      }),
    ),
    UpdateAvailable: BusEvent.define(
      "installation.update-available",
      z.object({
        version: z.string(),
      }),
    ),
  }

  export function getReleaseType(current: string, latest: string): ReleaseType {
    const currMajor = semver.major(current)
    const currMinor = semver.minor(current)
    const newMajor = semver.major(latest)
    const newMinor = semver.minor(latest)

    if (newMajor > currMajor) return "major"
    if (newMinor > currMinor) return "minor"
    return "patch"
  }

  export const Info = z
    .object({
      version: z.string(),
      latest: z.string(),
    })
    .meta({
      ref: "InstallationInfo",
    })
  export type Info = z.infer<typeof Info>

  export const VERSION = typeof COSTRICT_VERSION === "string" ? COSTRICT_VERSION : Package.version
  export const CHANNEL = typeof COSTRICT_CHANNEL === "string" ? COSTRICT_CHANNEL : Package.version
  export const COMMIT_HASH = typeof COSTRICT_COMMIT_HASH === "string" ? COSTRICT_COMMIT_HASH : "unknown"
  export const BUILD_TIME = typeof COSTRICT_BUILD_TIME === "string" ? COSTRICT_BUILD_TIME : "unknown"
  export const CLIENT = process.env["COSTRICT_CLIENT"] ?? "cli"
  export const USER_AGENT = `cs/${CHANNEL}/${VERSION}/${CLIENT}`

  export function isPreview() {
    return CHANNEL !== "latest"
  }

  export function isLocal() {
    return CHANNEL === "local"
  }

  export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
    stderr: Schema.String,
  }) {}

  // Response schemas for external version APIs
  const GitHubRelease = Schema.Struct({ tag_name: Schema.String })
  const NpmPackage = Schema.Struct({ version: Schema.String })
  const BrewFormula = Schema.Struct({ versions: Schema.Struct({ stable: Schema.String }) })
  const BrewInfoV2 = Schema.Struct({
    formulae: Schema.Array(Schema.Struct({ versions: Schema.Struct({ stable: Schema.String }) })),
  })
  const ChocoPackage = Schema.Struct({
    d: Schema.Struct({ results: Schema.Array(Schema.Struct({ Version: Schema.String })) }),
  })
  const ScoopManifest = NpmPackage

  export interface Interface {
    readonly info: () => Effect.Effect<Info>
    readonly method: () => Effect.Effect<Method>
    readonly latest: (method?: Method) => Effect.Effect<string>
    readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Installation") {}

  export const layer: Layer.Layer<Service, never, HttpClient.HttpClient | ChildProcessSpawner.ChildProcessSpawner> =
    Layer.effect(
      Service,
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient
        const httpOk = HttpClient.filterStatusOk(withTransientReadRetry(http))
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

        const text = Effect.fnUntraced(
          function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
            const proc = ChildProcess.make(cmd[0], cmd.slice(1), {
              cwd: opts?.cwd,
              env: opts?.env,
              extendEnv: true,
            })
            const handle = yield* spawner.spawn(proc)
            const out = yield* Stream.mkString(Stream.decodeText(handle.stdout))
            yield* handle.exitCode
            return out
          },
          Effect.scoped,
          Effect.catch(() => Effect.succeed("")),
        )

        const run = Effect.fnUntraced(
          function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
            const proc = ChildProcess.make(cmd[0], cmd.slice(1), {
              cwd: opts?.cwd,
              env: opts?.env,
              extendEnv: true,
            })
            const handle = yield* spawner.spawn(proc)
            const [stdout, stderr] = yield* Effect.all(
              [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))],
              { concurrency: 2 },
            )
            const code = yield* handle.exitCode
            return { code, stdout, stderr }
          },
          Effect.scoped,
          Effect.catch(() => Effect.succeed({ code: ChildProcessSpawner.ExitCode(1), stdout: "", stderr: "" })),
        )

        const getBrewFormula = Effect.fnUntraced(function* () {
          const tapFormula = yield* text(["brew", "list", "--formula", "anomalyco/tap/opencode"])
          if (tapFormula.includes("opencode")) return "anomalyco/tap/opencode"
          const coreFormula = yield* text(["brew", "list", "--formula", "opencode"])
          if (coreFormula.includes("opencode")) return "opencode"
          return "opencode"
        })

        const upgradeCurl = Effect.fnUntraced(
          function* (target: string) {
            const baseUrl = Flag.COSTRICT_BASE_URL || "https://zgsm.sangfor.com"

            // Windows: use install.bat
            if (process.platform === "win32") {
              const installBatUrl = Flag.COSTRICT_BASE_URL
                ? `${Flag.COSTRICT_BASE_URL}/costrict-cli/install.bat`
                : "https://costrict.ai/install.bat"
              const response = yield* httpOk.execute(
                HttpClientRequest.get(installBatUrl),
              )
              const body = yield* response.text
              const bodyBytes = new TextEncoder().encode(body)
              const proc = ChildProcess.make("cmd", ["/c"], {
                stdin: Stream.make(bodyBytes),
                env: { VERSION: target, COSTRICT_BASE_URL: baseUrl },
                extendEnv: true,
              })
              const handle = yield* spawner.spawn(proc)
              const [stdout, stderr] = yield* Effect.all(
                [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))],
                { concurrency: 2 },
              )
              const code = yield* handle.exitCode
              return { code, stdout, stderr }
            }

            // Unix-like: use install.sh via bash
            const installScriptUrl = Flag.COSTRICT_BASE_URL
              ? `${Flag.COSTRICT_BASE_URL}/costrict-cli/install.sh`
              : "https://costrict.ai/install.sh"
            const response = yield* httpOk.execute(
              HttpClientRequest.get(installScriptUrl),
            )
            const body = yield* response.text
            const bodyBytes = new TextEncoder().encode(body)
            const proc = ChildProcess.make("bash", [], {
              stdin: Stream.make(bodyBytes),
              env: { VERSION: target, COSTRICT_BASE_URL: baseUrl },
              extendEnv: true,
            })
            const handle = yield* spawner.spawn(proc)
            const [stdout, stderr] = yield* Effect.all(
              [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))],
              { concurrency: 2 },
            )
            const code = yield* handle.exitCode
            return { code, stdout, stderr }
          },
          Effect.scoped,
          Effect.orDie,
        )

        const methodImpl = Effect.fn("Installation.method")(function* () {
          if (process.execPath.includes(path.join(".costrict", "bin"))) return "curl" as Method
          if (process.execPath.includes(path.join(".local", "bin"))) return "curl" as Method
          const exec = process.execPath.toLowerCase()

          const checks: Array<{ name: Method; command: () => Effect.Effect<string> }> = [
            { name: "npm", command: () => text(["npm", "list", "-g", "--depth=0"]) },
            { name: "yarn", command: () => text(["yarn", "global", "list"]) },
            { name: "pnpm", command: () => text(["pnpm", "list", "-g", "--depth=0"]) },
            { name: "bun", command: () => text(["bun", "pm", "ls", "-g"]) },
            { name: "brew", command: () => text(["brew", "list", "--formula", "opencode"]) },
            { name: "scoop", command: () => text(["scoop", "list", "opencode"]) },
            { name: "choco", command: () => text(["choco", "list", "--limit-output", "opencode"]) },
          ]

          checks.sort((a, b) => {
            const aMatches = exec.includes(a.name)
            const bMatches = exec.includes(b.name)
            if (aMatches && !bMatches) return -1
            if (!aMatches && bMatches) return 1
            return 0
          })

          for (const check of checks) {
            const output = yield* check.command()
            // Check for multiple possible package names
            const possibleNames =
              check.name === "brew" || check.name === "choco" || check.name === "scoop"
                ? ["costrict"]
                : [
                    "@costrict/cs",
                    "@costrict/cs-darwin-arm64",
                    "@costrict/cs-linux-x64",
                    "@costrict/cs-darwin-x64",
                    "@costrict/cs-windows-x64",
                    "@costrict/cs-windows-x64-baseline",
                  ]

            for (const name of possibleNames) {
              if (output.includes(name)) {
                return check.name
              }
            }
          }

          // Check for npm-like installation paths (e.g., node_modules/@costrict/...)
          if (process.execPath.includes(path.join("node_modules", "@costrict"))) return "npm" as Method

          return "unknown" as Method
        })

        const latestImpl = Effect.fn("Installation.latest")(function* (installMethod?: Method) {
          const detectedMethod = installMethod || (yield* methodImpl())

          if (detectedMethod === "brew") {
            const formula = yield* getBrewFormula()
            if (formula.includes("/")) {
              const infoJson = yield* text(["brew", "info", "--json=v2", formula])
              const info = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(BrewInfoV2))(infoJson)
              return info.formulae[0].versions.stable
            }
            const response = yield* httpOk.execute(
              HttpClientRequest.get("https://formulae.brew.sh/api/formula/opencode.json").pipe(
                HttpClientRequest.acceptJson,
              ),
            )
            const data = yield* HttpClientResponse.schemaBodyJson(BrewFormula)(response)
            return data.versions.stable
          }

          if (detectedMethod === "npm" || detectedMethod === "bun" || detectedMethod === "pnpm") {
            const r = (yield* text(["npm", "config", "get", "registry"])).trim()
            const reg = r || "https://registry.npmjs.org"
            const registry = reg.endsWith("/") ? reg.slice(0, -1) : reg
            const channel = CHANNEL
            const response = yield* httpOk.execute(
              HttpClientRequest.get(`${registry}/@costrict/cs/${channel}`).pipe(HttpClientRequest.acceptJson),
            )
            const data = yield* HttpClientResponse.schemaBodyJson(NpmPackage)(response)
            return data.version
          }

          if (detectedMethod === "choco") {
            const response = yield* httpOk.execute(
              HttpClientRequest.get(
                "https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20%27opencode%27%20and%20IsLatestVersion&$select=Version",
              ).pipe(HttpClientRequest.setHeaders({ Accept: "application/json;odata=verbose" })),
            )
            const data = yield* HttpClientResponse.schemaBodyJson(ChocoPackage)(response)
            return data.d.results[0].Version
          }

          if (detectedMethod === "scoop") {
            const response = yield* httpOk.execute(
              HttpClientRequest.get(
                "https://raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/opencode.json",
              ).pipe(HttpClientRequest.setHeaders({ Accept: "application/json" })),
            )
            const data = yield* HttpClientResponse.schemaBodyJson(ScoopManifest)(response)
            return data.version
          }

          const baseUrl = Flag.COSTRICT_BASE_URL || "https://zgsm.sangfor.com"
          const response = yield* httpOk.execute(
            HttpClientRequest.get(`${baseUrl}/costrict-cli/pkg/latest.json`).pipe(
              HttpClientRequest.acceptJson,
            ),
          )
          const data = yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response)
          return data.tag_name.replace(/^v/, "")
        }, Effect.orDie)

        const upgradeImpl = Effect.fn("Installation.upgrade")(function* (m: Method, target: string) {
          let result: { code: ChildProcessSpawner.ExitCode; stdout: string; stderr: string } | undefined
          switch (m) {
            case "curl":
              result = yield* upgradeCurl(target)
              break
            case "npm":
              result = yield* run(["npm", "install", "-g", `@costrict/cs@${target}`])
              break
            case "pnpm":
              result = yield* run(["pnpm", "install", "-g", `@costrict/cs@${target}`])
              break
            case "bun":
              result = yield* run(["bun", "install", "-g", `@costrict/cs@${target}`])
              break
            case "brew": {
              const formula = yield* getBrewFormula()
              const env = { HOMEBREW_NO_AUTO_UPDATE: "1" }
              if (formula.includes("/")) {
                const tap = yield* run(["brew", "tap", "anomalyco/tap"], { env })
                if (tap.code !== 0) {
                  result = tap
                  break
                }
                const repo = yield* text(["brew", "--repo", "anomalyco/tap"])
                const dir = repo.trim()
                if (dir) {
                  const pull = yield* run(["git", "pull", "--ff-only"], { cwd: dir, env })
                  if (pull.code !== 0) {
                    result = pull
                    break
                  }
                }
              }
              result = yield* run(["brew", "upgrade", formula], { env })
              break
            }
            case "choco":
              result = yield* run(["choco", "upgrade", "opencode", `--version=${target}`, "-y"])
              break
            case "scoop":
              result = yield* run(["scoop", "install", `opencode@${target}`])
              break
            default:
              return yield* new UpgradeFailedError({ stderr: `Unknown method: ${m}` })
          }
          if (!result || result.code !== 0) {
            const stderr = m === "choco" ? "not running from an elevated command shell" : result?.stderr || ""
            return yield* new UpgradeFailedError({ stderr })
          }
          log.info("upgraded", {
            method: m,
            target,
            stdout: result.stdout,
            stderr: result.stderr,
          })
          yield* text([process.execPath, "--version"])
        })

        return Service.of({
          info: Effect.fn("Installation.info")(function* () {
            return {
              version: VERSION,
              latest: yield* latestImpl(),
            }
          }),
          method: methodImpl,
          latest: latestImpl,
          upgrade: upgradeImpl,
        })
      }),
    )

  export const defaultLayer = layer.pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(CrossSpawnSpawner.defaultLayer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function info(): Promise<Info> {
    return runPromise((svc) => svc.info())
  }

  export async function method(): Promise<Method> {
    return runPromise((svc) => svc.method())
  }

  export async function latest(installMethod?: Method): Promise<string> {
    return runPromise((svc) => svc.latest(installMethod))
  }

  export async function upgrade(m: Method, target: string): Promise<void> {
    return runPromise((svc) => svc.upgrade(m, target))
  }

  /**
   * Generate stable installation ID based on machine information
   * Compatible with costrict-cli InstallationManager
   */
  let cachedInstallationId: string | null = null
  export function getInstallationId(): string {
    // Try environment variable first (always check, not cached)
    const envId = process.env["COSTRICT_CLIENT_ID"]
    if (envId) {
      // If env ID changed, update cache
      if (cachedInstallationId !== envId) {
        cachedInstallationId = envId
      }
      return envId
    }

    // If we have a cached ID and no env var, return it
    if (cachedInstallationId) {
      return cachedInstallationId
    }

    // Generate stable ID based on hostname and username
    const host = hostname()
    const user = userInfo().username
    const machineInfo = `${host}-${user}`
    const hash = createHash("sha256").update(machineInfo).digest("hex")

    // Use first 32 characters for compatibility
    cachedInstallationId = hash.substring(0, 32)
    return cachedInstallationId
  }

  /**
   * Clear the installation ID cache (for testing)
   */
  export function clearInstallationIdCache(): void {
    cachedInstallationId = null
  }

  /**
   * Compare two semantic version strings
   * @param v1 - First version string (e.g., "1.2.3")
   * @param v2 - Second version string (e.g., "1.2.0")
   * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  export function compareVersions(v1: string | undefined | null, v2: string | undefined | null): number {
    if (!v1 || !v2) {
      throw new Error("Version string cannot be null or undefined")
    }
    const parts1 = v1.split(".").map(Number)
    const parts2 = v2.split(".").map(Number)
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0
      const p2 = parts2[i] || 0
      if (p1 > p2) return 1
      if (p1 < p2) return -1
    }
    return 0
  }
}
