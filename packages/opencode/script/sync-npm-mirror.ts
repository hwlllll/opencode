#!/usr/bin/env bun

const main = "@costrict/cs"

const targets = [
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl", avx2: false },
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "win32", arch: "x64" },
  { os: "win32", arch: "x64", avx2: false },
] as const

const pkgs = [
  main,
  ...targets.map((t) =>
    [
      main,
      t.os === "win32" ? "windows" : t.os,
      t.arch,
      "avx2" in t && t.avx2 === false ? "baseline" : undefined,
      "abi" in t ? t.abi : undefined,
    ]
      .filter(Boolean)
      .join("-"),
  ),
]

const headers = {
  accept: "*/*",
  "accept-language": "zh-CN,zh;q=0.9",
  "cache-control": "no-cache",
  "content-length": "0",
  origin: "https://npmmirror.com",
  pragma: "no-cache",
  priority: "u=1, i",
  referer: "https://npmmirror.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
}

async function latest(pkg: string) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`)
  const data = (await res.json()) as { version: string }
  return data.version
}

async function mirror(pkg: string) {
  const res = await fetch(`https://registry.npmmirror.com/${pkg}`)
  if (!res.ok) return null
  const data = (await res.json()) as
    | { "dist-tags": { latest: string }; time?: { [version: string]: string } }
    | null
  if (data?.["dist-tags"]?.latest) return data["dist-tags"].latest
  if (data?.time) {
    const versions = Object.keys(data.time).filter((v) => v !== "created" && v !== "modified")
    versions.sort((a, b) => {
      const timeA = data.time![a] ?? ""
      const timeB = data.time![b] ?? ""
      return timeB.localeCompare(timeA)
    })
    return versions[0] ?? null
  }
  return null
}

async function sync(pkg: string) {
  await fetch(`https://registry-direct.npmmirror.com/-/package/${pkg}/syncs`, {
    method: "PUT",
    headers,
  })
}

async function poll(pkg: string, target: string) {
  for (let i = 0; i < 60; i++) {
    const v = await mirror(pkg)
    if (v === target) return v
    await Bun.sleep(5000)
  }
  return await mirror(pkg)
}

console.log(`触发同步 ${pkgs.length} 个包...`)
await Promise.all(pkgs.map(sync))
console.log("同步请求已发送，开始轮询镜像版本...\n")

const platformPkgs = pkgs.filter((p) => p !== main)
const platformResults = await Promise.all(
  platformPkgs.map(async (pkg) => {
    const target = await latest(pkg)
    const v = await poll(pkg, target)
    const ok = v === target
    console.log(ok ? `✓ ${pkg}@${v} 已同步` : `✗ ${pkg} 同步超时（镜像版本: ${v}，最新: ${target}）`)
    return { pkg, ok, v, target }
  }),
)

const expectedVersion = platformResults[0]?.target
const mainResult = await Promise.all(
  [main].map(async (pkg) => {
    const target = expectedVersion ?? await latest(pkg)
    const v = await poll(pkg, target)
    const ok = v === target && (expectedVersion ? v === expectedVersion : true)
    console.log(ok ? `✓ ${pkg}@${v} 已同步` : `✗ ${pkg} 同步超时（镜像版本: ${v}，最新: ${target}）${expectedVersion ? ` - 与架构包版本${v === expectedVersion ? '一致' : '不一致'}` : ''}`)
    return { pkg, ok, v, target }
  }),
)

const results = [...platformResults, ...mainResult]

const succeeded = results.filter((r) => r.ok)
const failed = results.filter((r) => !r.ok)

console.log(`\n同步完成: ${succeeded.length}/${pkgs.length} 包已同步`)
if (failed.length > 0) {
  console.log("失败包列表:")
  failed.forEach((r) => console.log(`  - ${r.pkg}（镜像: ${r.v}，最新: ${r.target}）`))
}
