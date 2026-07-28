import path from "path"
import { copyFile, mkdir, readdir, rm } from "fs/promises"

const args = process.argv.slice(2)
const root = path.resolve(import.meta.dir, "..")
const pkg = await Bun.file(path.join(root, "packages/opencode/package.json")).json()

function option(name: string) {
  const pos = args.indexOf(name)
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? (pos < 0 ? undefined : args[pos + 1])
}

async function run(cmd: string[], env: Record<string, string> = {}) {
  const child = Bun.spawn(cmd, {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await child.exited
  if (code) throw new Error(`command failed (${code}): ${cmd.join(" ")}`)
}

if (args.includes("-h") || args.includes("--help")) {
  console.log(`Dicode package builder

Usage:
  bun run build:dicode [options]

Options:
  --target TARGETS    Comma-separated build targets (default: linux-x64-baseline)
  --version VERSION   Package version (default: packages/opencode/package.json)
  --skip-build        Package an existing build
  -h, --help          Show this help

Examples:
  bun run build:dicode
  DICODE_VERSION=1.0.0 bun run build:dicode --target linux-x64-baseline,windows-x64-baseline`)
  process.exit(0)
}

const version = (option("--version") ?? process.env.DICODE_VERSION ?? pkg.version).replace(/^v/, "")
const targets = (option("--target") ?? "linux-x64-baseline").split(",").filter(Boolean)
const allowed = [
  "linux-arm64",
  "linux-x64",
  "linux-x64-baseline",
  "linux-arm64-musl",
  "linux-x64-musl",
  "linux-x64-baseline-musl",
  "darwin-arm64",
  "darwin-x64",
  "darwin-x64-baseline",
  "windows-arm64",
  "windows-x64",
  "windows-x64-baseline",
]
const invalid = targets.find((target) => !allowed.includes(target))

if (!/^[0-9][0-9A-Za-z.+-]{0,63}$/.test(version)) throw new Error(`invalid version: ${version}`)
if (invalid) throw new Error(`unsupported target: ${invalid}`)

if (!args.includes("--skip-build")) {
  await run(["bun", "run", "--cwd", "packages/opencode", "script/build.ts", "--target", targets.join(",")], {
    COSTRICT_VERSION: version,
  })
}

const dist = path.join(root, "packages/opencode/dist")
const out = path.join(dist, version)
await mkdir(out, { recursive: true })

const archives = await Promise.all(
  targets.map(async (target) => {
    const dir = path.join(dist, `@costrict/cs-${target}`, "bin")
    const windows = target.startsWith("windows-")
    const src = path.join(dir, windows ? "cs.exe" : "cs")
    if (!(await Bun.file(src).exists())) throw new Error(`build output not found: ${src}`)
    const files = (await readdir(dir, { withFileTypes: true }))
      .filter((item) => item.isFile() && item.name !== path.basename(src))
      .map((item) => item.name)
    const name = `dicode-${target}.${windows ? "zip" : "tar.gz"}`
    const dest = path.join(out, name)

    if (!windows) {
      await run(["tar", "-czf", dest, "--transform=s|^cs$|dicode|", "-C", dir, "cs", ...files])
      return dest
    }

    const temp = path.join(out, `.stage-${target}`)
    await rm(temp, { recursive: true, force: true })
    await mkdir(temp)
    await Bun.write(path.join(temp, "dicode.exe"), Bun.file(src))
    await Promise.all(files.map((file) => copyFile(path.join(dir, file), path.join(temp, file))))
    await run(["zip", "-q", "-j", dest, path.join(temp, "dicode.exe"), ...files.map((file) => path.join(temp, file))])
    await rm(temp, { recursive: true, force: true })
    return dest
  }),
)

console.log(`Built Dicode ${version}:`)
for (const archive of archives) {
  console.log(`  ${path.relative(root, archive)} (${(Bun.file(archive).size / 1024 / 1024).toFixed(1)} MiB)`)
}
