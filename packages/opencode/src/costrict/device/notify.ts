import { Log } from "../../util/log"
import { getCloudApiUrl } from "./client"

const log = Log.create({ service: "device-notify" })

export interface InterventionPayload {
  type: "permission" | "question" | "idle"
  sessionID: string
  data: any
}

let _baseUrl: string | null = null
let _deviceToken: string | null = null
let _deviceId: string | null = null

export function initCloudNotifier(baseUrl: string, deviceToken: string, deviceId: string) {
  _baseUrl = baseUrl
  _deviceToken = deviceToken
  _deviceId = deviceId
  log.info("cloud notifier initialized", { deviceId })
}

export async function notifyCloud(payload: InterventionPayload, path: string): Promise<void> {
  if (!_baseUrl || !_deviceToken || !_deviceId) return

  const url = getCloudApiUrl("/cloud/device/notify", _baseUrl)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${_deviceToken}`,
      },
      body: JSON.stringify({
        deviceID: _deviceId,
        path: path,
        type: payload.type,
        sessionID: payload.sessionID,
        data: payload.data,
      }),
    })
    if (!res.ok) {
      log.warn("cloud notify failed", { status: res.status })
    }
  } catch (e: any) {
    log.warn("cloud notify error", { error: e.message })
  }
}
