import { promises as fs } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { loadCoStrictCredentials, saveCoStrictCredentials, type CoStrictCredentials } from "../provider/credentials"
import { getCoStrictBaseURL } from "../provider/auth"
import { extractExpiryFromJWT, isCoStrictTokenValid, refreshCoStrictToken } from "../provider/token"
import { Flag } from "../../flag/flag"
import { Installation } from "../../installation"
import { Log } from "../../util/log"

const log = Log.create({ service: "device-client" })
const INVALID_DEVICE_TOKEN_STATUSES = new Set([401, 403])
const INVALID_AUTH_TOKEN_STATUSES = new Set([401, 403])

export interface DeviceInfo {
  device_id: string
  device_token: string
  registered_at: string
  base_url: string
}

function getCoStrictHomeDir(): string {
  return process.env.COSTRICT_TEST_HOME || homedir()
}

export function getDevicePath(): string {
  return join(getCoStrictHomeDir(), ".costrict", "share", "device.json")
}

export async function loadDevice(): Promise<DeviceInfo | null> {
  try {
    const content = await fs.readFile(getDevicePath(), "utf-8")
    return JSON.parse(content) as DeviceInfo
  } catch (e: any) {
    if (e.code === "ENOENT") return null
    throw e
  }
}

async function saveDevice(info: DeviceInfo): Promise<void> {
  const dir = join(getCoStrictHomeDir(), ".costrict", "share")
  await fs.mkdir(dir, { recursive: true, mode: 0o755 })
  await fs.writeFile(getDevicePath(), JSON.stringify(info, null, 2), { encoding: "utf-8", mode: 0o600 })
}

export async function clearDevice(): Promise<void> {
  try {
    await fs.unlink(getDevicePath())
    log.info("local device registration cleared")
  } catch (e: any) {
    if (e.code === "ENOENT") return
    throw e
  }
}

const CLOUD_API_PREFIX = "cloud-api"

export function getCloudBaseUrl(credBaseUrl?: string): string {
  const raw = (Flag.COSTRICT_CLOUD_BASE_URL || credBaseUrl || Flag.COSTRICT_BASE_URL || "https://zgsm.sangfor.com").replace(/\/$/, "")
  if (raw.endsWith(`/${CLOUD_API_PREFIX}`)) return raw
  if (Flag.COSTRICT_CLOUD_BASE_URL) return raw
  const base = raw
  return `${base}/${CLOUD_API_PREFIX}`
}

export function getCloudApiUrl(path: string, baseUrl?: string) {
  const base = getCloudBaseUrl(baseUrl)
  const next = path.startsWith("/") ? path : `/${path}`
  return `${base}${next}`
}

async function renew(creds: CoStrictCredentials): Promise<CoStrictCredentials> {
  if (!creds.refresh_token) return creds
  const baseUrl = getCoStrictBaseURL(undefined, creds.base_url)
  const next = await refreshCoStrictToken({
    baseUrl,
    refreshToken: creds.refresh_token,
    state: creds.state,
  })
  const expiry = extractExpiryFromJWT(next.access_token)
  const fresh = {
    ...creds,
    base_url: baseUrl,
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    expiry_date: expiry,
    updated_at: new Date().toISOString(),
    expired_at: new Date(expiry).toISOString(),
  }
  await saveCoStrictCredentials(fresh)
  return fresh
}

async function auth(): Promise<CoStrictCredentials> {
  const creds = await loadCoStrictCredentials()
  if (!creds?.access_token) throw new Error("Not logged in. Please run `cs auth login` first.")
  if (!creds.refresh_token || isCoStrictTokenValid(creds)) return creds
  return renew(creds)
}

async function enroll(creds: CoStrictCredentials, baseUrl: string, deviceId: string) {
  const url = getCloudApiUrl("/api/devices/register", baseUrl)
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.access_token}`,
    },
    body: JSON.stringify({
      deviceId,
      displayName: require("node:os").hostname(),
      platform: process.platform,
      version: Installation.VERSION,
    }),
  })
}

export async function register(): Promise<DeviceInfo> {
  const existing = await loadDevice()
  if (existing) {
    log.info("device already registered, reusing", { device_id: existing.device_id })
    const resolved = getCloudBaseUrl()
    if (resolved !== existing.base_url) {
      existing.base_url = resolved
      log.info("base_url overridden by env", { base_url: resolved })
    }
    return existing
  }

  let creds = await auth()

  const baseUrl = getCloudBaseUrl(creds.base_url)
  const deviceId = creds.machine_id

  log.info("registering device", { device_id: deviceId })

  let res = await enroll(creds, baseUrl, deviceId)
  if ((res.status === 401 || res.status === 403) && creds.refresh_token) {
    creds = await renew(creds)
    res = await enroll(creds, baseUrl, deviceId)
  }

  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as {
      device?: { deviceId: string }
      token?: string
      error?: string
    }

    if (body.token && body.device?.deviceId) {
      const info: DeviceInfo = {
        device_id: body.device.deviceId,
        device_token: body.token,
        registered_at: new Date().toISOString(),
        base_url: baseUrl,
      }
      await saveDevice(info)
      log.info("device already registered by same user, recovered", { device_id: info.device_id })
      return info
    }

    throw new Error(body.error || "Device already registered by another user.")
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    const registerUrl = getCloudApiUrl("/api/devices/register", baseUrl)
    throw new Error(`Device registration failed: ${res.status} ${registerUrl} ${body}`)
  }

  const data = (await res.json()) as { device: { deviceId: string }; token: string }
  const info: DeviceInfo = {
    device_id: data.device.deviceId,
    device_token: data.token,
    registered_at: new Date().toISOString(),
    base_url: baseUrl,
  }

  await saveDevice(info)
  log.info("device registered", { device_id: info.device_id })
  return info
}

export async function rotateToken(): Promise<string> {
  const device = await loadDevice()
  if (!device) throw new Error("Device not registered. Run `cs device start` first.")

  const res = await fetch(getCloudApiUrl(`/api/devices/${device.device_id}/token/rotate`, device.base_url), {
    method: "POST",
    headers: { Authorization: `Bearer ${device.device_token}` },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Token rotation failed: ${res.status} ${body}`)
  }

  const data = (await res.json()) as { token: string }
  device.device_token = data.token
  await saveDevice(device)
  log.info("device token rotated", { device_id: device.device_id })
  return data.token
}

export async function validateDeviceToken(device: DeviceInfo): Promise<void> {
  const res = await fetch(getCloudApiUrl("/cloud/device/gateway-assign", device.base_url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${device.device_token}`,
    },
    body: JSON.stringify({
      deviceID: device.device_id,
      version: Installation.VERSION,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Device token validation failed: ${res.status} ${body}`)
  }

  log.info("device token validated", { device_id: device.device_id })
}

export function isInvalidDeviceTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const match = error.message.match(/Device token validation failed: (\d{3})\b/)
  if (!match) return false
  return INVALID_DEVICE_TOKEN_STATUSES.has(Number(match[1]))
}

export function isInvalidRegistrationAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const match = error.message.match(/Device registration failed: (\d{3})\b/)
  if (!match) return false
  return INVALID_AUTH_TOKEN_STATUSES.has(Number(match[1]))
}

export function isMissingRegistrationAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === "Not logged in. Please run `cs auth login` first."
}

export function isExpiredRegistrationAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === "Refresh token is invalid or expired"
}
