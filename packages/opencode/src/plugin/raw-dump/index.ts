import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { Config } from "@/config/config"
import { Flag } from "@/flag/flag"
import { MessageV2 } from "@/session/message-v2"
import { spawnRawDumpWorker } from "./spawn"

const SPAWNED_LIMIT = 1024
const spawned = new Set<string>()

function rememberSpawned(key: string) {
  if (spawned.size >= SPAWNED_LIMIT) {
    const target = Math.floor(SPAWNED_LIMIT / 2)
    let dropped = 0
    for (const k of spawned) {
      if (dropped >= target) break
      spawned.delete(k)
      dropped++
    }
  }
  spawned.add(key)
}

async function enabled() {
  if (Flag.COSTRICT_DISABLE_RAW_DUMP || Flag.OPENCODE_DISABLE_RAW_DUMP) return false
  const cfg = await Config.get()
  return cfg.raw_dump?.enabled !== false
}

export async function RawDumpPlugin(input: PluginInput): Promise<Hooks> {
  if (!(await enabled())) return {}

  return {
    event: async (evt) => {
      if (!(await enabled())) return
      if (evt.event.type !== MessageV2.Event.Updated.type) return

      const info = evt.event.properties.info
      if (info.role !== "assistant") return
      if (!info.time.completed) return

      const key = `${info.sessionID}:${info.id}`
      if (spawned.has(key)) return
      rememberSpawned(key)

      spawnRawDumpWorker({
        sessionID: info.sessionID,
        messageID: info.id,
        directory: input.directory,
      })
    },
  }
}
