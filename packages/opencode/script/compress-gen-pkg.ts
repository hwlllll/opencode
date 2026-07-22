#!/usr/bin/env bun
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { Script } from "@opencode-ai/script"
import Bun from "bun"
import { $ } from "bun"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

export async function generateLatestJson() {
  console.log("Generating latest.json...")
  const BASE_URL = process.env.COSTRICT_BASE_URL || "https://zgsm.sangfor.com"
  const version = Script.version
  const distPath = path.join(dir, "dist")
  const versionDir = path.join(distPath, version)
  const artifactsDir = path.join(distPath, "@costrict")

  if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true })
  }

  const entries = fs.readdirSync(artifactsDir)
  const platformDirs = entries.filter((name) => name.startsWith("cs-"))

  if (platformDirs.length === 0) {
    console.warn("No platform artifacts found in dist/@costrict")
    return
  }

  for (const platformName of platformDirs) {
    const platform = platformName.replace(/^cs-/, "")
    const srcPath = path.join(artifactsDir, platformName)

    if (!fs.statSync(srcPath).isDirectory()) continue

    const isWindows = platform.includes("windows")
    const ext = isWindows ? ".zip" : ".tar.gz"
    const archiveName = `costrict-cs-${platform}${ext}`
    const destPath = path.join(versionDir, archiveName)

    console.log(`Compressing ${platformName} to ${archiveName}`)

    if (isWindows) {
      await $`(cd ${srcPath} && zip -rq ${destPath} .)`
    } else {
      await $`tar -czf ${destPath} -C ${srcPath} .`
    }
  }

  const versionEntries = fs.readdirSync(versionDir)
  const artifactNames = versionEntries.filter((name) => name.endsWith(".zip") || name.endsWith(".tar.gz"))

  if (artifactNames.length === 0) {
    console.warn("No artifacts found in version directory")
    return
  }

  const assets = await Promise.all(
    artifactNames.map(async (name) => {
      const filePath = path.join(versionDir, name)
      const fileBuffer = await Bun.file(filePath).arrayBuffer()
      const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      const file = Bun.file(filePath)
      const fileSize = file.size

      return {
        name,
        size: fileSize,
        browser_download_url: `${BASE_URL}/costrict-cli/pkg/${version}/${name}`,
        digest: `sha256:${hashHex}`,
      }
    }),
  )

  const latestInfo = {
    tag_name: version,
    name: version,
    html_url: "",
    published_at: new Date().toISOString(),
    assets,
  }

  const LATEST_JSON_PATH = path.join(versionDir, "latest.json")
  await Bun.write(LATEST_JSON_PATH, JSON.stringify(latestInfo, null, 2))
  console.log(`Generated latest.json at ${LATEST_JSON_PATH}`)
}

// Allow running this script directly
if (import.meta.main) {
  await generateLatestJson()
}
