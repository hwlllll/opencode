import type { ServerConnection } from "@/context/server"
import { createDeviceClient, type DeviceClient } from "@/client/device-client"

export function createSdkForServer({
  server,
  ...config
}: {
  server: ServerConnection.HttpBase
  headers?: HeadersInit
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  directory?: string
  throwOnError?: boolean
}): DeviceClient {
  const auth = (() => {
    if (!server.password) return
    return {
      Authorization: `Basic ${btoa(`${server.username ?? "opencode"}:${server.password}`)}`,
    }
  })()

  return createDeviceClient({
    ...config,
    headers: { ...config.headers, ...auth },
    baseUrl: server.url,
  })
}
