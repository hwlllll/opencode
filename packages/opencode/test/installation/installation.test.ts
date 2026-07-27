import { test, expect, mock, beforeAll, beforeEach, afterEach, describe } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Installation } from "../../src/installation/index"
import { Dicode } from "../../src/config/dicode"
import { promises as fs } from "node:fs"
import path from "node:path"

// Save original environment
const originalEnv = process.env.COSTRICT_CLIENT_ID

beforeEach(() => {
  // Clear cache before each test
  Installation.clearInstallationIdCache()
  // Clear environment variable
  delete process.env.COSTRICT_CLIENT_ID
})

// Restore original environment
beforeAll(() => {
  if (originalEnv !== undefined) {
    process.env.COSTRICT_CLIENT_ID = originalEnv
  } else {
    delete process.env.COSTRICT_CLIENT_ID
  }
})

const encoder = new TextEncoder()

function mockHttpClient(handler: (request: HttpClientRequest.HttpClientRequest) => Response) {
  const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))))
  return Layer.succeed(HttpClient.HttpClient, client)
}

function mockSpawner(handler: (cmd: string, args: readonly string[]) => string = () => "") {
  const spawner = ChildProcessSpawner.make((command) => {
    const std = ChildProcess.isStandardCommand(command) ? command : undefined
    const output = handler(std?.command ?? "", std?.args ?? [])
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: { [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") } as any,
        stdout: output ? Stream.make(encoder.encode(output)) : Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => ({ [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") }) as any,
        getOutputFd: () => Stream.empty,
      }),
    )
  })
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function testLayer(
  httpHandler: (request: HttpClientRequest.HttpClientRequest) => Response,
  spawnHandler?: (cmd: string, args: readonly string[]) => string,
) {
  return Installation.layer.pipe(Layer.provide(mockHttpClient(httpHandler)), Layer.provide(mockSpawner(spawnHandler)))
}

describe("installation", () => {
  test("Installation.getInstallationId returns 32-character SHA256 hash", () => {
    const id = Installation.getInstallationId()

    expect(id).toHaveLength(32)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
  })

  test("Installation.getInstallationId: COSTRICT_CLIENT_ID environment variable takes precedence", () => {
    process.env.COSTRICT_CLIENT_ID = "custom-client-id-123456789012"

    const id = Installation.getInstallationId()

    expect(id).toBe("custom-client-id-123456789012")

    // Clean up
    delete process.env.COSTRICT_CLIENT_ID
  })

  test("Installation.getInstallationId caches installation ID - returns same ID on multiple calls", () => {
    const id1 = Installation.getInstallationId()
    const id2 = Installation.getInstallationId()

    expect(id1).toBe(id2)
  })

  test("Installation.getInstallationId clears cache when COSTRICT_CLIENT_ID changes", () => {
    process.env.COSTRICT_CLIENT_ID = "first-id"
    const id1 = Installation.getInstallationId()

    process.env.COSTRICT_CLIENT_ID = "second-id"
    const id2 = Installation.getInstallationId()

    expect(id1).toBe("first-id")
    expect(id2).toBe("second-id")

    // Clean up
    delete process.env.COSTRICT_CLIENT_ID
  })

  test("Installation.compareVersions handles normal version comparisons", () => {
    expect(Installation.compareVersions("1.0.0", "1.0.0")).toBe(0)
    expect(Installation.compareVersions("1.0.1", "1.0.0")).toBe(1)
    expect(Installation.compareVersions("1.0.0", "1.0.1")).toBe(-1)
    expect(Installation.compareVersions("2.0.0", "1.9.9")).toBe(1)
    expect(Installation.compareVersions("1.2.3", "1.2.4")).toBe(-1)
  })

  test("Installation.compareVersions handles versions with different lengths", () => {
    expect(Installation.compareVersions("1.0", "1.0.0")).toBe(0)
    expect(Installation.compareVersions("1.0.0.0", "1.0")).toBe(0)
    expect(Installation.compareVersions("1.0.1", "1.0")).toBe(1)
    expect(Installation.compareVersions("1.0", "1.0.1")).toBe(-1)
  })

  test("Installation.compareVersions throws error for undefined or null inputs", () => {
    expect(() => Installation.compareVersions(undefined as any, "1.0.0")).toThrow(
      "Version string cannot be null or undefined",
    )
    expect(() => Installation.compareVersions("1.0.0", undefined as any)).toThrow(
      "Version string cannot be null or undefined",
    )
    expect(() => Installation.compareVersions(null as any, "1.0.0")).toThrow("Version string cannot be null or undefined")
    expect(() => Installation.compareVersions("1.0.0", null as any)).toThrow("Version string cannot be null or undefined")
  })

  test("Installation.compareVersions correctly finds latest version from version list", () => {
    const versions = ["3.0.1", "3.0.2", "3.0.3", "3.0.4", "3.0.0", "3.0.5", "3.0.6", "3.0.7", "3.0.8", "3.0.9"]

    const latestVersion = versions.sort((a, b) => Installation.compareVersions(b, a))[0]

    expect(latestVersion).toBe("3.0.9")
  })

  test("Installation.compareVersions filters out pre-release versions correctly", () => {
    const versions = ["3.0.9", "0.0.0-refactor-workflow-202603060823", "0.0.0-refactor-workflow-202603060904", "3.0.8"]

    const stableVersions = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    const latestVersion = stableVersions.sort((a, b) => Installation.compareVersions(b, a))[0]

    expect(stableVersions).toHaveLength(2)
    expect(stableVersions).toContain("3.0.9")
    expect(stableVersions).toContain("3.0.8")
    expect(latestVersion).toBe("3.0.9")
  })

  describe("latest", () => {
    test("reads release version from Dicode download config", async () => {
      await fs.mkdir(path.dirname(Dicode.file), { recursive: true })
      await Bun.write(
        Dicode.file,
        JSON.stringify({
          api: "https://api.example.com",
          download: "https://download.example.com",
        }),
      )
      const urls: string[] = []
      const layer = testLayer((request) => {
        urls.push(request.url.toString())
        return jsonResponse({ tag_name: "v1.2.3" })
      })

      try {
        const result = await Effect.runPromise(
          Installation.Service.use((svc) => svc.latest("curl")).pipe(Effect.provide(layer)),
        )
        expect(result).toBe("1.2.3")
        expect(urls).toEqual(["https://download.example.com/dicode/pkg/latest.json"])
      } finally {
        await fs.unlink(Dicode.file).catch(() => {})
      }
    })

    test("reads release version from GitHub releases", async () => {
      const layer = testLayer(() => jsonResponse({ tag_name: "v1.2.3" }))

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("unknown")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("1.2.3")
    })

    test("strips v prefix from GitHub release tag", async () => {
      const layer = testLayer(() => jsonResponse({ tag_name: "v4.0.0-beta.1" }))

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("curl")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("4.0.0-beta.1")
    })

    test("reads npm registry versions", async () => {
      const layer = testLayer(
        () => jsonResponse({ version: "1.5.0" }),
        (cmd, args) => {
          if (cmd === "npm" && args.includes("registry")) return "https://registry.npmjs.org\n"
          return ""
        },
      )

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("npm")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("1.5.0")
    })

    test("reads npm registry versions for bun method", async () => {
      const layer = testLayer(
        () => jsonResponse({ version: "1.6.0" }),
        () => "",
      )

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("bun")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("1.6.0")
    })

    test("reads scoop manifest versions", async () => {
      const layer = testLayer(() => jsonResponse({ version: "2.3.4" }))

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("scoop")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("2.3.4")
    })

    test("reads chocolatey feed versions", async () => {
      const layer = testLayer(() => jsonResponse({ d: { results: [{ Version: "3.4.5" }] } }))

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("choco")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("3.4.5")
    })

    test("reads brew formulae API versions", async () => {
      const layer = testLayer(
        () => jsonResponse({ versions: { stable: "2.0.0" } }),
        (cmd, args) => {
          // getBrewFormula: return core formula (no tap)
          if (cmd === "brew" && args.includes("--formula") && args.includes("anomalyco/tap/opencode")) return ""
          if (cmd === "brew" && args.includes("--formula") && args.includes("opencode")) return "opencode"
          return ""
        },
      )

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("brew")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("2.0.0")
    })

    test("reads brew tap info JSON via CLI", async () => {
      const brewInfoJson = JSON.stringify({
        formulae: [{ versions: { stable: "2.1.0" } }],
      })
      const layer = testLayer(
        () => jsonResponse({}), // HTTP not used for tap formula
        (cmd, args) => {
          if (cmd === "brew" && args.includes("anomalyco/tap/opencode") && args.includes("--formula")) return "opencode"
          if (cmd === "brew" && args.includes("--json=v2")) return brewInfoJson
          return ""
        },
      )

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("brew")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("2.1.0")
    })
  })
})
