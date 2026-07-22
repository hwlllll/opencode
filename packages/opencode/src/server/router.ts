import type { MiddlewareHandler } from "hono"
import { getAdaptor } from "@/control-plane/adaptors"
import { WorkspaceID } from "@/control-plane/schema"
import { Workspace } from "@/control-plane/workspace"
import { lazy } from "@/util/lazy"
import { Filesystem } from "@/util/filesystem"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { InstanceBootstrap } from "@/project/bootstrap"
import { InstanceRoutes } from "./instance"

type Rule = { method?: string; path: string; exact?: boolean; action: "local" | "forward" }

const RULES: Array<Rule> = [
  { path: "/session/status", action: "forward" },
  { method: "GET", path: "/session", action: "local" },
]

function local(method: string, path: string) {
  for (const rule of RULES) {
    if (rule.method && rule.method !== method) continue
    const match = rule.exact ? path === rule.path : path === rule.path || path.startsWith(rule.path + "/")
    if (match) return rule.action === "local"
  }
  return false
}

const routes = lazy(() => InstanceRoutes())

export const WorkspaceRouterMiddleware: MiddlewareHandler = async (c) => {
  const raw = c.req.query("directory") || c.req.header("x-opencode-directory") || process.cwd()
  const directory = Filesystem.resolve(
    (() => {
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw
      }
    })(),
  )

  const url = new URL(c.req.url)
  const t0 = Date.now()
  Log.Default.debug("[perf.router] -->", { method: c.req.method, path: url.pathname, directory })
  const workspaceParam = url.searchParams.get("workspace")

  if (!workspaceParam) {
    return Instance.provide({
      directory,
      init: InstanceBootstrap,
      async fn() {
        const t1 = Date.now()
        const res = await routes().fetch(c.req.raw, c.env)
        Log.Default.debug("[perf.router] <--", { path: url.pathname, routeHandlerMs: Date.now() - t1, totalMs: Date.now() - t0 })
        return res
      },
    }).then((res) => {
      Log.Default.debug("[perf.router] <--", { path: url.pathname, instanceProvideAndRouteTotalMs: Date.now() - t0 })
      return res
    })
  }

  const workspaceID = WorkspaceID.make(workspaceParam)
  const workspace = await Workspace.get(workspaceID)
  if (!workspace) {
    return new Response(`Workspace not found: ${workspaceID}`, {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    })
  }

  // Handle local workspaces directly so we can pass env to `fetch`,
  // necessary for websocket upgrades
  if (workspace.type === "worktree") {
    return Instance.provide({
      directory: workspace.directory!,
      init: InstanceBootstrap,
      async fn() {
        return routes().fetch(c.req.raw, c.env)
      },
    })
  }

  // Remote workspaces

  if (local(c.req.method, url.pathname)) {
    // No instance provided because we are serving cached data; there
    // is no instance to work with
    return routes().fetch(c.req.raw, c.env)
  }

  const adaptor = await getAdaptor(workspace.type)
  const headers = new Headers(c.req.raw.headers)
  headers.delete("x-opencode-workspace")

  return adaptor.fetch(workspace, `${url.pathname}${url.search}`, {
    method: c.req.method,
    body: c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.raw.arrayBuffer(),
    signal: c.req.raw.signal,
    headers,
  })
}
