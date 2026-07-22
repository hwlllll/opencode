import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar, windowsify } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

const binary = windowsify(
  `../opencode/dist/${sidecarConfig.ocBinary.replace("opencode-", "@costrict/cs-")}/bin/cs`,
)

await $`cd ../opencode && bun run build:builtin-agents`
await (sidecarConfig.ocBinary.includes("-baseline")
  ? $`cd ../opencode && COSTRICT_CHANNEL=local bun run script/build.ts --single --baseline`
  : $`cd ../opencode && COSTRICT_CHANNEL=local bun run script/build.ts --single`)

await copyBinaryToSidecarFolder(binary, RUST_TARGET)
