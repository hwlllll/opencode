#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

if (!process.argv.includes("--all")) {
  process.argv.push("--all")
}
const { binaries } = await import("./build.ts")
{
  const name = `${pkg.name}-${process.platform}-${process.arch}`
  console.log(`smoke test: running dist/${name}/bin/cs --version`)
  await $`./dist/${name}/bin/cs --version`
}
console.log("binaries", binaries)
const version = Object.values(binaries)[0]

await $`mkdir -p ./dist/${pkg.name}`
await $`cp -r ./bin ./dist/${pkg.name}/bin`
await $`cp ./script/postinstall.mjs ./dist/${pkg.name}/postinstall.mjs`
await Bun.file(`./dist/${pkg.name}/LICENSE`).write(await Bun.file("../../LICENSE").text())

await Bun.file(`./dist/${pkg.name}/package.json`).write(
  JSON.stringify(
    {
      name: pkg.name,
      bin: {
        cs: `./bin/cs`,
      },
      scripts: {
        postinstall: "bun ./postinstall.mjs || node ./postinstall.mjs",
      },
      version: version,
      license: pkg.license,
      optionalDependencies: binaries,
    },
    null,
    2,
  ),
)

const tasks = Object.entries(binaries).map(async ([name, version]) => {
  if (process.platform !== "win32") {
    await $`chmod -R 755 .`.cwd(`./dist/${name}`)
  }
  const pkgPath = `./dist/${name}/package.json`
  const pkg = JSON.parse(await Bun.file(pkgPath).text())
  const originalVersion = pkg.version
  pkg.version = version.replace(/\//g, "-")
  await Bun.file(pkgPath).write(JSON.stringify(pkg, null, 2))
  await $`bun pm pack`.cwd(`./dist/${name}`)
  pkg.version = originalVersion
  await Bun.file(pkgPath).write(JSON.stringify(pkg, null, 2))
  await $`npm publish *.tgz --access public --tag ${Script.channel}`.cwd(`./dist/${name}`)
})
await Promise.all(tasks)
const mainPkgPath = `./dist/${pkg.name}/package.json`
const mainPkg = JSON.parse(await Bun.file(mainPkgPath).text())
const originalMainVersion = mainPkg.version
mainPkg.version = version.replace(/\//g, "-")
await Bun.file(mainPkgPath).write(JSON.stringify(mainPkg, null, 2))
await $`cd ./dist/${pkg.name} && bun pm pack && npm publish *.tgz --access public --tag ${Script.channel}`
mainPkg.version = originalMainVersion
await Bun.file(mainPkgPath).write(JSON.stringify(mainPkg, null, 2))

const image = "ghcr.io/anomalyco/opencode"
const platforms = "linux/amd64,linux/arm64"
const tags = [`${image}:${version}`, `${image}:${Script.channel}`]
const tagFlags = tags.flatMap((t) => ["-t", t])
// await $`docker buildx build --platform ${platforms} ${tagFlags} --push .`

