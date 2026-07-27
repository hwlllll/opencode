#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

await import("./generate-agents.ts")
await import("./generate-review-builtin.ts")

if (!process.argv.includes("--all")) {
  process.argv.push("--all")
}
const { binaries } = await import("./build.ts")

const version = Object.values(binaries)[0]
const dest = `./dist/${version}`
await $`mkdir -p ${dest}`

// pack all platform sub-packages
const tasks = Object.entries(binaries).map(async ([name, ver]) => {
  if (process.platform !== "win32") {
    await $`chmod -R 755 .`.cwd(`./dist/${name}`)
  }
  const pkgPath = `./dist/${name}/package.json`
  const p = JSON.parse(await Bun.file(pkgPath).text())
  const orig = p.version
  p.version = ver.replace(/\//g, "-")
  await Bun.file(pkgPath).write(JSON.stringify(p, null, 2))
  await $`bun pm pack`.cwd(`./dist/${name}`)
  p.version = orig
  await Bun.file(pkgPath).write(JSON.stringify(p, null, 2))
  const tgz = await Array.fromAsync(new Bun.Glob("*.tgz").scan({ cwd: `./dist/${name}` }))
  for (const f of tgz) {
    await $`mv ./dist/${name}/${f} ${dest}/${f}`
  }
})
await Promise.all(tasks)

// prepare and pack main package
await $`mkdir -p ./dist/${pkg.name}`
await $`cp -r ./bin ./dist/${pkg.name}/bin`
await $`cp ./script/postinstall.mjs ./dist/${pkg.name}/postinstall.mjs`
await Bun.file(`./dist/${pkg.name}/LICENSE`).write(await Bun.file("../../LICENSE").text())

const mainPkgPath = `./dist/${pkg.name}/package.json`
await Bun.file(mainPkgPath).write(
  JSON.stringify(
    {
      name: pkg.name,
      bin: { dicode: `./bin/cs` },
      scripts: {
        postinstall: "bun ./postinstall.mjs || node ./postinstall.mjs",
      },
      version: version.replace(/\//g, "-"),
      license: pkg.license,
      optionalDependencies: binaries,
    },
    null,
    2,
  ),
)
await $`bun pm pack`.cwd(`./dist/${pkg.name}`)
const mainTgz = await Array.fromAsync(new Bun.Glob("*.tgz").scan({ cwd: `./dist/${pkg.name}` }))
for (const f of mainTgz) {
  await $`mv ./dist/${pkg.name}/${f} ${dest}/${f}`
}

console.log(`all tarballs moved to ${dest}`)
