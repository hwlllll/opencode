import { $ } from "bun"
import { rm } from "node:fs/promises"

export type Channel = "dev" | "beta" | "prod"
export type Platform = "mac" | "win" | "linux"
export type Arch = "arm64" | "x64"

export function resolveChannel(): Channel {
  const raw = Bun.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
}

export const SIDECAR_BINARIES: Array<{
  platform: Platform
  arch: Arch
  rustTarget: string
  ocBinary: string
  assetExt: string
}> = [
  {
    platform: "mac",
    arch: "arm64",
    rustTarget: "aarch64-apple-darwin",
    ocBinary: "opencode-darwin-arm64",
    assetExt: "zip",
  },
  {
    platform: "mac",
    arch: "x64",
    rustTarget: "x86_64-apple-darwin",
    ocBinary: "opencode-darwin-x64-baseline",
    assetExt: "zip",
  },
  {
    platform: "win",
    arch: "arm64",
    rustTarget: "aarch64-pc-windows-msvc",
    ocBinary: "opencode-windows-arm64",
    assetExt: "zip",
  },
  {
    platform: "win",
    arch: "x64",
    rustTarget: "x86_64-pc-windows-msvc",
    ocBinary: "opencode-windows-x64-baseline",
    assetExt: "zip",
  },
  {
    platform: "linux",
    arch: "x64",
    rustTarget: "x86_64-unknown-linux-gnu",
    ocBinary: "opencode-linux-x64-baseline",
    assetExt: "tar.gz",
  },
  {
    platform: "linux",
    arch: "arm64",
    rustTarget: "aarch64-unknown-linux-gnu",
    ocBinary: "opencode-linux-arm64",
    assetExt: "tar.gz",
  },
]

export const RUST_TARGET = Bun.env.RUST_TARGET

function nativeTarget() {
  const { platform, arch } = process
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
  if (platform === "win32") return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc"
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu"
  throw new Error(`Unsupported platform: ${platform}/${arch}`)
}

export function getCurrentSidecar(target = RUST_TARGET ?? nativeTarget()) {
  const binaryConfig = SIDECAR_BINARIES.find((b) => b.rustTarget === target)
  if (!binaryConfig) throw new Error(`Sidecar configuration not available for Rust target '${target}'`)

  return binaryConfig
}

export function getSidecar(platform: Platform, arch: Arch) {
  const binary = SIDECAR_BINARIES.find((item) => item.platform === platform && item.arch === arch)
  if (!binary) throw new Error(`Sidecar configuration not available for ${platform}/${arch}`)
  return binary
}

export async function copyBinaryToSidecarFolder(source: string, sidecar = getCurrentSidecar()) {
  const dir = `resources`
  await $`mkdir -p ${dir}`
  const dest = windowsify(`${dir}/opencode-cli`, sidecar)
  await Promise.all(
    [`${dir}/opencode-cli`, `${dir}/opencode-cli.exe`]
      .filter((file) => file !== dest)
      .map((file) => rm(file, { force: true })),
  )
  await $`cp ${source} ${dest}`
  if (sidecar.platform === "win" && process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }
  if (sidecar.platform === "mac" && process.platform === "darwin") await $`codesign --force --sign - ${dest}`

  console.log(`Copied ${source} to ${dest}`)
}

export function windowsify(path: string, sidecar = getCurrentSidecar()) {
  if (path.endsWith(".exe")) return path
  return `${path}${sidecar.platform === "win" ? ".exe" : ""}`
}
