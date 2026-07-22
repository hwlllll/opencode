#!/usr/bin/env bun

const gen = Bun.spawn(["bun", "script/generate-agents.ts"], {
  cwd: "packages/opencode",
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

if ((await gen.exited) !== 0) process.exit(1)

const app = Bun.spawn(["./node_modules/.bin/vite", "--strictPort"], {
  cwd: "packages/app",
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

async function ready(count = 0): Promise<void> {
  if (count === 100) throw new Error("Web app did not start on http://localhost:3000")
  const ok = await fetch("http://localhost:3000").then(
    (res) => res.ok,
    () => false,
  )
  if (ok) return
  await Bun.sleep(100)
  return ready(count + 1)
}

await ready()

const api = Bun.spawn(["bun", "--conditions=browser", "./src/index.ts", "web", "--port", "4096"], {
  cwd: "packages/opencode",
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

function stop() {
  app.kill()
  api.kill()
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)

const code = await Promise.race([app.exited, api.exited])
stop()
process.exit(code)
