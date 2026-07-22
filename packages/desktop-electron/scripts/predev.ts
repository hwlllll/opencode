import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar, windowsify } from "./utils"

await $`bun ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

const RUST_TARGET = Bun.env.RUST_TARGET

const sidecar = getCurrentSidecar(RUST_TARGET)

const binary = windowsify(
  `../opencode/dist/${sidecar.ocBinary.replace("opencode-", "@costrict/cs-")}/bin/cs`,
  sidecar,
)

await $`cd ../opencode && bun run build:builtin-agents`
await $`cd ../opencode && COSTRICT_CHANNEL=local bun run script/build.ts --target ${sidecar.ocBinary.replace("opencode-", "")}`

await copyBinaryToSidecarFolder(binary, sidecar)
