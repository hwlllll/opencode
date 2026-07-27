import path from "path"
import { mkdir } from "fs/promises"

const pkg = path.join(import.meta.dir, "../packages/opencode/node_modules/tree-sitter-powershell")
const name = "tree-sitter-powershell.node"
const dir = path.join(pkg, "prebuilds", `${process.platform}-${process.arch}`)
const dest = path.join(dir, name)

if (await Bun.file(dest).exists()) process.exit(0)

const src = path.join(pkg, "build/Release/tree_sitter_powershell_binding.node")
if (!(await Bun.file(src).exists())) {
  throw new Error(`tree-sitter-powershell build output not found: ${src}`)
}

await mkdir(dir, { recursive: true })
await Bun.write(dest, Bun.file(src))
console.log(`Installed ${name} for ${process.platform}-${process.arch}`)
