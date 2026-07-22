import { Log } from "../util/log"

export interface DiskSpace {
  free: number
  total: number
  used: number
}

export interface DiskSpaceCheckResult {
  hasEnoughSpace: boolean
  free: number
  threshold: number
  path: string
}

const log = Log.create({ service: "disk" })

export namespace Disk {
  const MB = 1024 * 1024
  const GB = 1024 * 1024 * 1024

  function parseSize(size: string): number {
    const lower = size.toLowerCase()
    if (lower.endsWith("kb")) return parseFloat(lower) * 1024
    if (lower.endsWith("gb")) return parseFloat(lower) * GB
    if (lower.endsWith("mb")) return parseFloat(lower) * MB
    if (lower.endsWith("g")) return parseFloat(lower) * GB
    if (lower.endsWith("m")) return parseFloat(lower) * MB
    if (lower.endsWith("k")) return parseFloat(lower) * 1024
    return parseFloat(size)
  }

  async function getDiskSpaceUnix(path: string): Promise<DiskSpace> {
    try {
      const { execSync } = await import("child_process")
      const result = execSync(`df -k "${path}"`, { encoding: "utf-8" })
      const lines = result.trim().split("\n")
      if (lines.length < 2) {
        throw new Error("Unexpected df output")
      }
      const parts = lines[1].split(/\s+/)
      const total = parseInt(parts[1], 10) * 1024
      const free = parseInt(parts[3], 10) * 1024
      return {
        free,
        total,
        used: total - free,
      }
    } catch (err) {
      log.warn("Failed to get disk space using df", { error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  async function getDiskSpaceWindows(path: string): Promise<DiskSpace> {
    try {
      const { execSync } = await import("child_process")
      const drive = path.split(":")[0] + ":"
      const result = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace,Size`, { encoding: "utf-8", windowsHide: true })
      const lines = result.trim().split("\n")
      if (lines.length < 2) {
        throw new Error("Unexpected wmic output")
      }
      const parts = lines[1].trim().split(/\s+/)
      const free = parseInt(parts[0], 10)
      const total = parseInt(parts[1], 10)
      return {
        free,
        total,
        used: total - free,
      }
    } catch (err) {
      log.warn("Failed to get disk space using wmic", { error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  export async function getDiskSpace(path: string): Promise<DiskSpace> {
    const platform = process.platform

    if (platform === "win32") {
      return getDiskSpaceWindows(path)
    }

    return getDiskSpaceUnix(path)
  }

  export async function checkDiskSpace(path: string, threshold: string | number): Promise<DiskSpaceCheckResult> {
    const thresholdBytes = typeof threshold === "string" ? parseSize(threshold) : threshold

    try {
      const space = await getDiskSpace(path)
      const hasEnoughSpace = space.free >= thresholdBytes

      return {
        hasEnoughSpace,
        free: space.free,
        threshold: thresholdBytes,
        path,
      }
    } catch (err) {
      log.error("Failed to check disk space", {
        path,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      })
      return {
        hasEnoughSpace: false,
        free: 0,
        threshold: thresholdBytes,
        path,
      }
    }
  }

  export function formatBytes(bytes: number): string {
    const gb = bytes / GB
    if (gb >= 1) return `${gb.toFixed(2)} GB`
    const mb = bytes / MB
    return `${mb.toFixed(2)} MB`
  }
}
