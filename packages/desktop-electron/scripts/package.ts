#!/usr/bin/env bun

import { $ } from "bun"

import { type Arch, copyBinaryToSidecarFolder, getSidecar, type Platform, windowsify } from "./utils"

const args = process.argv.slice(2).filter((arg) => arg !== "--")
const raw = args[0]

if (raw === "help" || raw === "--help" || raw === "-h") {
  console.log("Usage: bun ./scripts/package.ts [mac|win|linux|all] [arm64|x64]")
  process.exit(0)
}

const native = (() => {
  if (process.platform === "darwin") return "mac"
  if (process.platform === "win32") return "win"
  if (process.platform === "linux") return "linux"
  throw new Error(`Unsupported host: ${process.platform}/${process.arch}`)
})()
const platform = raw ?? native
if (platform !== "mac" && platform !== "win" && platform !== "linux" && platform !== "all") {
  throw new Error(`Unsupported platform '${platform}'. Use mac, win, linux, or all.`)
}

const requested = args[1] ?? Bun.env.ELECTRON_ARCH
if (requested && requested !== "arm64" && requested !== "x64") {
  throw new Error(`Unsupported architecture '${requested}'. Use arm64 or x64.`)
}

const host = process.arch === "arm64" ? "arm64" : "x64"
const platforms: Platform[] = platform === "all" ? ["mac", "win", "linux"] : [platform]
const targets = platforms.map((platform) => ({
  platform,
  arch: (requested ?? (platform === "mac" ? host : "x64")) as Arch,
}))
const mirror = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/",
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ?? "https://npmmirror.com/mirrors/electron-builder-binaries/",
}

if (targets.some((item) => item.platform === "mac") && process.platform !== "darwin") {
  throw new Error("macOS packages must be built on macOS. Build win/linux here, and run package:mac on a Mac.")
}

await $`bun run build`
await $`cd ../opencode && bun run build:builtin-agents`
const sidecars = targets.map((target) => ({ target, sidecar: getSidecar(target.platform, target.arch) }))
await $`cd ../opencode && COSTRICT_CHANNEL=local bun run script/build.ts --target ${sidecars.map((item) => item.sidecar.ocBinary.replace("opencode-", "")).join(",")}`

for (const item of sidecars) {
  const target = item.target
  const sidecar = item.sidecar
  const name = sidecar.ocBinary.replace("opencode-", "@costrict/cs-")
  const binary = windowsify(`../opencode/dist/${name}/bin/cs`, sidecar)

  console.log(`\nPackaging ${target.platform}/${target.arch}`)
  await copyBinaryToSidecarFolder(binary, sidecar)
  await $`electron-builder ${`--${target.platform}`} ${`--${target.arch}`} --config electron-builder.config.ts`.env(
    mirror,
  )
  if (target.platform !== "linux" || process.platform === "linux") continue

  await $`docker build --platform linux/amd64 --file scripts/Dockerfile.linux --tag opencode-electron-linux-builder scripts`
  await $`docker run --rm --platform linux/amd64 --env ELECTRON_BUILDER_BINARIES_MIRROR=${mirror.ELECTRON_BUILDER_BINARIES_MIRROR} --env ELECTRON_LINUX_TARGETS=deb,rpm --volume ${`${process.cwd()}:/project`} --workdir /project opencode-electron-linux-builder --linux ${`--${target.arch}`} --prepackaged dist/linux-unpacked --config electron-builder.config.ts`
}
