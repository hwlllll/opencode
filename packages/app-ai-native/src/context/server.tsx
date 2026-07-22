import { createSimpleContext } from "@opencode-ai/ui/context"
import { type Accessor, batch, createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { Persist, persisted } from "@/utils/persist"

type StoredProject = { worktree: string; expanded: boolean }
type StoredServer = string | ServerConnection.HttpBase | ServerConnection.Http

export function normalizeServerUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
  return withProtocol.replace(/\/+$/, "")
}

export function serverName(conn?: ServerConnection.Any, ignoreDisplayName = false) {
  if (!conn) return ""
  if (conn.displayName && !ignoreDisplayName) return conn.displayName
  return conn.http.url.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

function projectsKey(key: ServerConnection.Key) {
  if (!key) return ""
  if (isLocalHost(key)) return "local"
  return key
}

function isLocalHost(url: string) {
  const host = url.replace(/^https?:\/\//, "").split(":")[0]
  if (host === "localhost" || host === "127.0.0.1") return "local"
}

export namespace ServerConnection {
  type Base = { displayName?: string }

  export type HttpBase = {
    url: string
    username?: string
    password?: string
  }

  export type Http = {
    type: "http"
    http: HttpBase
  } & Base

  export type Any = Http

  export const key = (conn: Any): Key => {
    return Key.make(conn.http.url)
  }

  export type Key = string & { _brand: "Key" }
  export const Key = { make: (v: string) => v as Key }
}

export const { use: useServer, provider: ServerProvider } = createSimpleContext({
  name: "Server",
  gate: false,  // 避免未选定 server 时不渲染子元素
  init: (props: { defaultServer: ServerConnection.Key; servers?: Array<ServerConnection.Any> }) => {
    const platform = usePlatform()

    const [store, setStore, _, ready] = persisted(
      Persist.global("server", ["server.v3"]),
      createStore({
        list: [] as StoredServer[],
        projects: {} as Record<string, StoredProject[]>,
        lastProject: {} as Record<string, string>,
      }),
    )

    const url = (x: StoredServer) => (typeof x === "string" ? x : "type" in x ? x.http.url : x.url)

    const allServers = createMemo((): Array<ServerConnection.Any> => {
      const normalize = (conn: ServerConnection.Any): ServerConnection.Any => {
        const normalized = normalizeServerUrl(conn.http.url)
        if (!normalized || normalized === conn.http.url) return conn
        return { ...conn, http: { ...conn.http, url: normalized } }
      }

      const servers = [
        ...(props.servers ?? []).map(normalize),
        ...store.list.map((value) =>
          typeof value === "string"
            ? { type: "http" as const, http: { url: value } }
            : value,
        ),
      ]

      const deduped = new Map(
        servers.map((value) => {
          const conn: ServerConnection.Any = "type" in value ? value : { type: "http", http: value }
          return [ServerConnection.key(conn), conn]
        }),
      )

      return [...deduped.values()]
    })

    const [state, setState] = createStore({
      active: props.defaultServer,
      healthy: undefined as boolean | undefined,
    })

    const healthy = () => state.healthy

    function setActive(input: ServerConnection.Key) {
      if (state.active !== input) setState("active", input)
    }

    function add(input: ServerConnection.Http) {
      const url_ = normalizeServerUrl(input.http.url)
      if (!url_) return
      const conn = { ...input, http: { ...input.http, url: url_ } }
      return batch(() => {
        const existing = store.list.findIndex((x) => url(x) === url_)
        if (existing !== -1) {
          setStore("list", existing, conn)
        } else {
          setStore("list", store.list.length, conn)
        }
        setState("active", ServerConnection.key(conn))
        return conn
      })
    }

    function remove(key: ServerConnection.Key) {
      const list = store.list.filter((x) => url(x) !== key)
      batch(() => {
        setStore("list", list)
        if (state.active === key) {
          const next = list[0]
          setState("active", next ? ServerConnection.Key.make(url(next)) : props.defaultServer)
        }
      })
    }

    const isReady = createMemo(() => ready() && !!state.active)

    const provided = createMemo(() => {
      const list = props.servers ?? []
      return new Set(list.map((s) => ServerConnection.key(s)))
    })

    createEffect(() => {
      const active = state.active
      if (!active) return
      const keys = provided()
      if (keys.size === 0) {
        setState("active", props.defaultServer)
        return
      }
      if (keys.has(active)) return
      setState("active", props.defaultServer)
    })

    const origin = createMemo(() => projectsKey(state.active))
    const projectsList = createMemo(() => store.projects[origin()] ?? [])
    const current: Accessor<ServerConnection.Any | undefined> = createMemo(
      () => state.active ? allServers().find((s) => ServerConnection.key(s) === state.active) : undefined,
    )
    return {
      ready: isReady,
      healthy,
      get key() {
        return state.active
      },
      get name() {
        return serverName(current())
      },
      get list() {
        return allServers()
      },
      get current() {
        return current()
      },
      setActive,
      add,
      remove,
      projects: {
        list: projectsList,
        open(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          if (current.find((x) => x.worktree === directory)) return
          setStore("projects", key, [{ worktree: directory, expanded: true }, ...current])
        },
        close(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          setStore(
            "projects",
            key,
            current.filter((x) => x.worktree !== directory),
          )
        },
        expand(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const index = current.findIndex((x) => x.worktree === directory)
          if (index !== -1) setStore("projects", key, index, "expanded", true)
        },
        collapse(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const index = current.findIndex((x) => x.worktree === directory)
          if (index !== -1) setStore("projects", key, index, "expanded", false)
        },
        move(directory: string, toIndex: number) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const fromIndex = current.findIndex((x) => x.worktree === directory)
          if (fromIndex === -1 || fromIndex === toIndex) return
          const result = [...current]
          const [item] = result.splice(fromIndex, 1)
          result.splice(toIndex, 0, item)
          setStore("projects", key, result)
        },
        last() {
          const key = origin()
          if (!key) return
          return store.lastProject[key]
        },
        touch(directory: string) {
          const key = origin()
          if (!key) return
          setStore("lastProject", key, directory)
        },
      },
    }
  },
})
