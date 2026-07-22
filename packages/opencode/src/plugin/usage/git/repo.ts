import { git } from "@/util/git"
import { Filesystem } from "@/util/filesystem"

const cache = new Map<string, string | null>()

export function normalize(url: string) {
  const value = url.replace(/^git@([^:]+):/, "https://$1/")
  const text = value.replace(/\.git$/i, "").replace(/\/+$/, "")
  try {
    const next = new URL(text)
    next.username = ""
    next.password = ""
    return next.toString().replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase()
  } catch {
    return text.replace(/^(https?:\/\/)(?:[^/@]+@)/i, "$1").toLowerCase()
  }
}

export async function repo(dir: string) {
  const key = Filesystem.resolve(dir)
  if (cache.has(key)) return cache.get(key) ?? undefined
  const result = await git(["-C", key, "remote", "get-url", "origin"], { cwd: key })
  if (result.exitCode !== 0) {
    cache.set(key, null)
    return
  }
  const text = result.text().trim()
  if (!text) {
    cache.set(key, null)
    return
  }
  const value = normalize(text)
  cache.set(key, value)
  return value
}
