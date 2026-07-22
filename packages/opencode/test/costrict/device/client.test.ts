import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../../fixture/fixture"

function createJWT(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.signature`
}

describe("costrict.device.client", () => {
  let homeTmp: Awaited<ReturnType<typeof tmpdir>>
  let originalFetch: typeof fetch
  let originalHome: string | undefined

  beforeEach(async () => {
    homeTmp = await tmpdir()
    originalFetch = globalThis.fetch
    originalHome = process.env.COSTRICT_TEST_HOME
    process.env.COSTRICT_TEST_HOME = homeTmp.path

    const authDir = path.join(homeTmp.path, ".costrict", "share")
    await fs.mkdir(authDir, { recursive: true })
    await fs.writeFile(
      path.join(authDir, "auth.json"),
      JSON.stringify({
        id: "opencode",
        name: "Test User",
        access_token: createJWT({
          id: "user-1",
          sub: "user-1",
          exp: Math.floor(Date.now() / 1000) + 60 * 60,
        }),
        refresh_token: createJWT({ exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }),
        machine_id: "machine-1",
        base_url: "https://costrict.test",
        expiry_date: Date.now() + 60 * 60 * 1000,
        updated_at: new Date().toISOString(),
      }),
    )
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    if (originalHome === undefined) delete process.env.COSTRICT_TEST_HOME
    else process.env.COSTRICT_TEST_HOME = originalHome
    await homeTmp[Symbol.asyncDispose]()
  })

  test("validateDeviceToken succeeds for a valid device token", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      calls.push({ url, init })
      return new Response(JSON.stringify({ gatewayURL: "wss://gateway.costrict.test" }), { status: 200 })
    }) as unknown as typeof fetch

    const { validateDeviceToken } = await import("../../../src/costrict/device/client.ts")

    await expect(
      validateDeviceToken({
        device_id: "device-1",
        device_token: "token-1",
        registered_at: new Date().toISOString(),
        base_url: "https://costrict.test/cloud-api",
      }),
    ).resolves.toBeUndefined()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://costrict.test/cloud-api/cloud/device/gateway-assign")
    expect(calls[0]?.init?.method).toBe("POST")
    expect((calls[0]?.init?.headers as Record<string, string>)?.Authorization).toBe("Bearer token-1")
  })

  test("validateDeviceToken surfaces invalid token errors", async () => {
    globalThis.fetch = mock(async () => new Response("token invalid", { status: 401 })) as unknown as typeof fetch

    const {
      validateDeviceToken,
      isInvalidDeviceTokenError,
      isInvalidRegistrationAuthError,
      isMissingRegistrationAuthError,
      isExpiredRegistrationAuthError,
    } = await import("../../../src/costrict/device/client.ts")

    const error = await expect(
      validateDeviceToken({
        device_id: "device-1",
        device_token: "bad-token",
        registered_at: new Date().toISOString(),
        base_url: "https://costrict.test/cloud-api",
      }),
    ).rejects.toThrow("Device token validation failed: 401 token invalid")

    expect(isInvalidDeviceTokenError(new Error("Device token validation failed: 401 token invalid"))).toBe(true)
    expect(isInvalidDeviceTokenError(new Error("Device token validation failed: 503 no gateway available"))).toBe(false)
    expect(isInvalidRegistrationAuthError(new Error("Device registration failed: 401 {\"error\":\"Invalid token\"}"))).toBe(true)
    expect(isInvalidRegistrationAuthError(new Error("Device registration failed: 503 no gateway available"))).toBe(false)
    expect(isMissingRegistrationAuthError(new Error("Not logged in. Please run `cs auth login` first."))).toBe(true)
    expect(isMissingRegistrationAuthError(new Error("something else"))).toBe(false)
    expect(isExpiredRegistrationAuthError(new Error("Refresh token is invalid or expired"))).toBe(true)
    expect(isExpiredRegistrationAuthError(new Error("something else"))).toBe(false)
  })

  test("clearDevice removes local device.json", async () => {
    const { clearDevice, getDevicePath, loadDevice } = await import("../../../src/costrict/device/client.ts")

    const devicePath = getDevicePath()
    await fs.writeFile(
      devicePath,
      JSON.stringify({
        device_id: "device-1",
        device_token: "token-1",
        registered_at: new Date().toISOString(),
        base_url: "https://costrict.test/cloud-api",
      }),
    )

    expect(await loadDevice()).not.toBeNull()
    await clearDevice()
    expect(await loadDevice()).toBeNull()
  })

  test("register refreshes auth token after a 401 response", async () => {
    const calls: string[] = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      calls.push(url)

      if (url.includes("/api/devices/register") && calls.filter((x) => x.includes("/api/devices/register")).length === 1) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 })
      }

      if (url.includes("/oidc-auth/api/v1/plugin/login/token")) {
        return new Response(
          JSON.stringify({
            access_token: createJWT({ exp: Math.floor(Date.now() / 1000) + 60 * 60 }),
            refresh_token: createJWT({ exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }),
          }),
          { status: 200 },
        )
      }

      if (url.includes("/api/devices/register")) {
        return new Response(
          JSON.stringify({
            device: { deviceId: "machine-1" },
            token: "device-token-1",
          }),
          { status: 201 },
        )
      }

      return new Response("unexpected", { status: 500 })
    }) as unknown as typeof fetch

    const authDir = path.join(homeTmp.path, ".costrict", "share")
    await fs.writeFile(
      path.join(authDir, "auth.json"),
      JSON.stringify({
        id: "opencode",
        name: "Test User",
        access_token: createJWT({ exp: Math.floor(Date.now() / 1000) + 60 * 60 }),
        refresh_token: createJWT({ exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }),
        state: "state-1",
        machine_id: "machine-1",
        base_url: "https://costrict.test",
        expiry_date: Date.now() + 60 * 60 * 1000,
        updated_at: new Date().toISOString(),
      }),
    )

    const { register } = await import("../../../src/costrict/device/client.ts")
    const device = await register()

    expect(device.device_id).toBe("machine-1")
    expect(device.device_token).toBe("device-token-1")
    expect(calls.filter((x) => x.includes("/api/devices/register"))).toHaveLength(2)
    expect(calls.some((x) => x.includes("/oidc-auth/api/v1/plugin/login/token"))).toBe(true)
  })

  test("register accepts wrapped refresh token responses", async () => {
    const calls: string[] = []
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      calls.push(url)

      if (url.includes("/api/devices/register") && calls.filter((x) => x.includes("/api/devices/register")).length === 1) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 })
      }

      if (url.includes("/oidc-auth/api/v1/plugin/login/token")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              access_token: createJWT({ exp: Math.floor(Date.now() / 1000) + 60 * 60 }),
              refresh_token: createJWT({ exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }),
            },
          }),
          { status: 200 },
        )
      }

      if (url.includes("/api/devices/register")) {
        return new Response(
          JSON.stringify({
            device: { deviceId: "machine-1" },
            token: "device-token-1",
          }),
          { status: 201 },
        )
      }

      return new Response("unexpected", { status: 500 })
    }) as unknown as typeof fetch

    const { register } = await import("../../../src/costrict/device/client.ts")
    const device = await register()

    expect(device.device_token).toBe("device-token-1")
    expect(calls.some((x) => x.includes("/oidc-auth/api/v1/plugin/login/token"))).toBe(true)
  })

  test("register includes the registration URL in error messages", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ error_msg: "404 Route Not Found" }), { status: 404 })
    }) as unknown as typeof fetch

    const { register } = await import("../../../src/costrict/device/client.ts")

    await expect(register()).rejects.toThrow(
      "Device registration failed: 404 https://costrict.test/cloud-api/api/devices/register {\"error_msg\":\"404 Route Not Found\"}",
    )
  })
})
