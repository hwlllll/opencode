import { existsSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export namespace Dicode {
  export const file = path.join(process.env.COSTRICT_TEST_HOME || os.homedir(), ".dicode", "config.json")

  function get(key: "api" | "download") {
    if (!existsSync(file)) return
    const data: unknown = JSON.parse(readFileSync(file, "utf8"))
    if (!data || typeof data !== "object") return
    const value = (data as Record<string, unknown>)[key]
    if (typeof value !== "string") return
    return value.replace(/\/$/, "")
  }

  export function api() {
    return get("api")
  }

  export function download() {
    return get("download")
  }
}
