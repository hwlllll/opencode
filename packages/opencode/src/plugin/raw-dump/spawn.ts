import { spawn } from "node:child_process"
import path from "node:path"

const RAW_DUMP_EVENT_ENV_KEY = "__RAW_DUMP_EVENT__"

export interface RawDumpEventPayload {
  sessionID: string
  messageID: string
  directory: string
}

export function getRawDumpEventEnvKey() {
  return RAW_DUMP_EVENT_ENV_KEY
}

export function spawnRawDumpWorker(payload: RawDumpEventPayload) {
  const entry = process.execPath
  const dev = path.basename(entry).toLowerCase().startsWith("bun")
  const args = dev
    ? ["run", "--conditions=browser", path.resolve(import.meta.dirname, "../../index.ts"), "raw-dump", "_worker"]
    : ["raw-dump", "_worker"]

  const child = spawn(entry, args, {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      [RAW_DUMP_EVENT_ENV_KEY]: JSON.stringify(payload),
    },
    ...(dev ? { cwd: path.resolve(import.meta.dirname, "../../..") } : {}),
  })

  child.unref()
}
