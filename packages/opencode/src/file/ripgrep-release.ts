export const VERSION = "14.1.1"

export const TARGETS = {
  "arm64-darwin": { platform: "aarch64-apple-darwin", extension: "tar.gz" },
  "arm64-linux": { platform: "aarch64-unknown-linux-gnu", extension: "tar.gz" },
  "x64-darwin": { platform: "x86_64-apple-darwin", extension: "tar.gz" },
  "x64-linux": { platform: "x86_64-unknown-linux-musl", extension: "tar.gz" },
  "arm64-win32": { platform: "aarch64-pc-windows-msvc", extension: "zip" },
  "x64-win32": { platform: "x86_64-pc-windows-msvc", extension: "zip" },
} as const

export function archive(key: keyof typeof TARGETS) {
  const item = TARGETS[key]
  return `ripgrep-${VERSION}-${item.platform}.${item.extension}`
}
