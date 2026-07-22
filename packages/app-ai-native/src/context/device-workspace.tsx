import { createContext, useContext, type ParentProps } from "solid-js"
import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useDeviceSDK } from "./device-sdk"
import { syncSummary, clearSummary } from "./workspace-summary-store"
import type { Session, Command, Agent, VcsInfo, SessionStatus, PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2/client"
import type { ProviderCapabilitiesResponse } from "./global-sync/types"

function groupBy<T extends { id?: string; sessionID?: string }>(items: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {}
  for (const item of items) {
    if (!item?.id || !item.sessionID) continue
    const list = map[item.sessionID]
    if (list) list.push(item)
    else map[item.sessionID] = [item]
  }
  return map
}

type WorkspaceData = {
  status: "loading" | "ready" | "unavailable"
  agent: Agent[]
  command: Command[]
  session: Session[]
  sessionStatus: Record<string, SessionStatus>
  questions: Record<string, QuestionRequest[]>
  permissions: Record<string, PermissionRequest[]>
  sessionTotal: number
  vcs: VcsInfo | undefined
  provider: ProviderCapabilitiesResponse
  agentAvailable: boolean
  unread: Record<string, boolean>
}

type EventPayload = { type: string; sessionID?: string; messageID?: string; properties?: any; [key: string]: unknown }

type DeviceWorkspaceValue = {
  data: WorkspaceData
  ready: () => boolean
  agentAvailable: () => boolean
  project: {
    worktree: string
    name: string | undefined
    time: { created: number; updated: number }
  }
  session: {
    get: (id: string) => Session | undefined
    fetch(count?: number): Promise<void>
    remove(id: string): Promise<void>
    setStatus(id: string, status: SessionStatus | undefined): void
    setQuestions(questions: Record<string, QuestionRequest[]>): void
    setPermissions(permissions: Record<string, PermissionRequest[]>): void
    removePermission(sessionID: string, requestID: string): void
    clearUnread(id: string): void
  }
  command: {
    load(): Promise<Command[]>
  }
  vcs: {
    load(): Promise<VcsInfo | undefined>
  }
  subscribe(fn: (payload: EventPayload) => void): () => void
  directory: string
  workspaceId: string | undefined
}

const DeviceWorkspaceContext = createContext<DeviceWorkspaceValue>()

export function useDeviceWorkspace() {
  const ctx = useContext(DeviceWorkspaceContext)
  if (!ctx) throw new Error("useDeviceWorkspace must be used within DeviceWorkspaceProvider")
  return ctx
}

export { DeviceWorkspaceContext }

export function DeviceWorkspaceProvider(props: ParentProps<{ workspaceId?: string }>) {
  const device = useDeviceSDK()

  const [store, setStore] = createStore<WorkspaceData>({
    status: "loading",
    agent: [],
    command: [],
    session: [],
    sessionStatus: {},
    questions: {},
    permissions: {},
    sessionTotal: 0,
    vcs: undefined,
    provider: { connected: [] } as ProviderCapabilitiesResponse,
    agentAvailable: true,
    unread: {},
  })

  const checkAgentAvailable = async () => {
    try {
      const res = await device.client.agent.health() as any
      const agents = res?.agents ?? res
      if (Array.isArray(agents) && agents.length > 0) {
        const anyAvailable = agents.some((a: any) => a.available)
        setStore("agentAvailable", anyAvailable)
        return anyAvailable
      }
      setStore("agentAvailable", true)
      return true
    } catch {
      setStore("agentAvailable", false)
      return false
    }
  }

  const bootstrap = async () => {
    setStore("status", "loading")
    try {
      const agentAvailable = await checkAgentAvailable()
      if (!agentAvailable) {
        setStore("status", "unavailable")
        return
      }

      const [sessionsRes, vcsRes] = await Promise.all([
        device.client.conversation.list({ roots: "true", limit: 50, directory: device.directory }).catch(() => undefined),
        device.client.runtime.vcs().catch(() => undefined),
      ])

      const [allSessionsRes, sessionStatusRes, permsRes, questionsRes] = await Promise.all([
        device.client.conversation.list({ limit: 50 }).catch(() => undefined),
        device.client.conversation.status().catch(() => undefined),
        device.client.permission.list().catch(() => undefined),
        device.client.question.list().catch(() => undefined),
      ])

      const agentPromise = Promise.all([
        device.client.agent.sessionModes().catch(() => undefined),
        device.client.agent.models().catch(() => undefined),
      ])

      batch(() => {
        const rootSessions = (Array.isArray(sessionsRes) ? sessionsRes : []) as Session[]
        const allSessions = (Array.isArray(allSessionsRes) ? allSessionsRes : []) as Session[]
        const children = allSessions.filter((s) => !!s?.id && !!s.parentID)
        const merged = [...rootSessions, ...children].filter((s) => !!s?.id)
        setStore("session", reconcile(merged.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), { key: "id" }))
        setStore("sessionStatus", reconcile((sessionStatusRes as Record<string, SessionStatus>) ?? {}))
        setStore("sessionTotal", rootSessions.length)
        setStore("vcs", vcsRes as VcsInfo | undefined)
        setStore("questions", reconcile(groupBy(Array.isArray(questionsRes) ? questionsRes : [])))
        setStore("permissions", reconcile(groupBy(Array.isArray(permsRes) ? permsRes : [])))
        setStore("status", "ready")
        if (props.workspaceId) {
          syncSummary(props.workspaceId, {
            vcs: vcsRes as VcsInfo | undefined,
            sessionStatus: (sessionStatusRes as Record<string, SessionStatus>) ?? {},
            questions: groupBy(Array.isArray(questionsRes) ? questionsRes : []),
            permissions: groupBy(Array.isArray(permsRes) ? permsRes : []),
          })
        }
      })

      agentPromise.then(([agentsRes, providersRes]) => {
        batch(() => {
          setStore("agent", reconcile((agentsRes as Agent[]) ?? [], { key: "name" }))
          const providerData = (providersRes as ProviderCapabilitiesResponse) ?? { connected: [] }
          setStore("provider", reconcile(providerData, { key: "id" }))
        })
      })

      void startEventStream()
    } catch {
      setStore("status", "unavailable")
    }
  }

  void bootstrap()

  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const RETRY_INTERVAL = 5000

  const scheduleRetry = () => {
    if (retryTimer) return
    retryTimer = setTimeout(async () => {
      retryTimer = undefined
      if (store.agentAvailable) return
      const available = await checkAgentAvailable()
      if (available) {
        await bootstrap()
      } else {
        scheduleRetry()
      }
    }, RETRY_INTERVAL)
  }

  createEffect(() => {
    if (!store.agentAvailable) scheduleRetry()
  })

  onCleanup(() => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
  })

  const getSession = (id: string) => store.session.find((s) => s.id === id)

  const setSessionStatus = (id: string, status: SessionStatus | undefined) => {
    if (!id) return
    if (!status || status.type === "idle") {
      setStore("sessionStatus", produce((draft) => {
        delete draft[id]
      }))
      return
    }
    setStore("sessionStatus", id, reconcile(status))
  }

  const addQuestion = (item: QuestionRequest) => {
    if (!item?.id || !item?.sessionID) return
    if (!store.questions[item.sessionID]) {
      setStore("questions", item.sessionID, [item])
      return
    }
    if (store.questions[item.sessionID].some((r) => r.id === item.id)) return
    setStore("questions", item.sessionID, produce((draft: QuestionRequest[]) => {
      draft.push(item)
    }))
  }

  const removeQuestion = (sessionID: string, requestID: string) => {
    if (!sessionID || !requestID) return
    const list = store.questions[sessionID]
    if (!list) return
    const idx = list.findIndex((r) => r.id === requestID)
    if (idx === -1) return
    setStore("questions", sessionID, produce((draft: QuestionRequest[]) => {
      draft.splice(idx, 1)
    }))
  }

  const addPermission = (item: PermissionRequest) => {
    if (!item?.id || !item?.sessionID) return
    if (!store.permissions[item.sessionID]) {
      setStore("permissions", item.sessionID, [item])
      return
    }
    if (store.permissions[item.sessionID].some((r) => r.id === item.id)) return
    setStore("permissions", item.sessionID, produce((draft: PermissionRequest[]) => {
      draft.push(item)
    }))
  }

  const removePermission = (sessionID: string, requestID: string) => {
    if (!sessionID || !requestID) return
    const list = store.permissions[sessionID]
    if (!list) return
    const idx = list.findIndex((r) => r.id === requestID)
    if (idx === -1) return
    setStore("permissions", sessionID, produce((draft: PermissionRequest[]) => {
      draft.splice(idx, 1)
    }))
  }

  const fetchSessions = async (count = 10) => {
    if (!store.agentAvailable) return
    try {
      const [result, statusResult] = await Promise.all([
        device.client.conversation.list({ roots: "true", limit: 50, directory: device.directory }),
        device.client.conversation.status().catch(() => undefined),
      ])
      const sessions = (result as Session[]) ?? []
      batch(() => {
        setStore("session", reconcile(sessions.filter((s) => !!s?.id).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), { key: "id" }))
        setStore("sessionStatus", reconcile((statusResult as Record<string, SessionStatus>) ?? {}))
        setStore("sessionTotal", sessions.length)
      })
    } catch {}
  }

  const deleteSession = async (id: string) => {
    if (!store.agentAvailable) return
    try {
      await device.client.conversation.delete(id)
      batch(() => {
        setStore("session", produce((draft) => {
          const idx = draft.findIndex((s) => s.id === id)
          if (idx !== -1) draft.splice(idx, 1)
        }))
        setSessionStatus(id, undefined)
        setStore("unread", produce((draft) => { delete draft[id] }))
        setStore("questions", produce((draft) => { delete draft[id] }))
        setStore("permissions", produce((draft) => { delete draft[id] }))
        if (props.workspaceId) {
          syncSummary(props.workspaceId, {
            vcs: store.vcs,
            sessionStatus: store.sessionStatus,
            questions: store.questions,
            permissions: store.permissions,
            hasUnreadSession: store.session.some((s) => !s.parentID && store.unread[s.id]),
          })
        }
      })

    } catch {}
  }

  const loadCommands = async (): Promise<Command[]> => {
    if (!store.agentAvailable) return []
    if (store.command.length > 0) return store.command
    try {
      const result = await device.client.agent.commands()
      const list = (result as Command[]) ?? []
      setStore("command", reconcile(list, { key: "name" }))
      return list
    } catch {
      return []
    }
  }

  const loadVcs = async (): Promise<VcsInfo | undefined> => {
    if (store.vcs !== undefined) return store.vcs
    try {
      const result = await device.client.runtime.vcs()
      setStore("vcs", result as VcsInfo | undefined)
        if (props.workspaceId) {
          syncSummary(props.workspaceId, {
            vcs: result as VcsInfo | undefined,
            sessionStatus: store.sessionStatus,
            questions: store.questions,
            permissions: store.permissions,
            hasUnreadSession: store.session.some((s) => !s.parentID && store.unread[s.id]),
          })
      }
      return result as VcsInfo | undefined
    } catch {
      return undefined
    }
  }

  const listeners = new Set<(payload: EventPayload) => void>()

  const subscribe = (fn: (payload: EventPayload) => void) => {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }

  const dispatch = (payload: EventPayload) => {
    for (const fn of listeners) {
      try { fn(payload) } catch {}
    }
  }

  let streamAbort: AbortController | undefined

  const startEventStream = async () => {
    streamAbort?.abort()
    streamAbort = new AbortController()
    const signal = streamAbort.signal
    try {
      const { stream } = await device.client.event.stream({ signal })
      const readLoop = async () => {
        try {
          for await (const event of stream as any) {
            if (signal.aborted) break
            if (!event) continue
            const payload = (event.payload ?? event) as EventPayload
            if (!payload?.type) continue

            batch(() => {
              let summaryChanged = false
              switch (payload.type) {
                case "session.created":
                case "session.updated": {
                  const info = (payload.properties as { info?: Session })?.info ?? payload.properties as Session
                  if (!info?.id) break
                  setStore("session", produce((draft) => {
                    const idx = draft.findIndex((s) => s.id === info.id)
                    if (idx !== -1) draft[idx] = info
                    else {
                      draft.push(info)
                      draft.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
                    }
                  }))
                  break
                }
                case "session.deleted": {
                  const dp = payload.properties as { sessionID?: string; info?: Session }
                  const id = dp?.sessionID ?? dp?.info?.id ?? payload.sessionID
                  if (!id) break
                  batch(() => {
                    setStore("session", produce((draft) => {
                      const idx = draft.findIndex((s) => s.id === id)
                      if (idx !== -1) draft.splice(idx, 1)
                    }))
                    setSessionStatus(id, undefined)
                    setStore("unread", produce((draft) => { delete draft[id] }))
                    setStore("questions", produce((draft) => { delete draft[id] }))
                    setStore("permissions", produce((draft) => { delete draft[id] }))
                  })
                  summaryChanged = true
                  break
                }
                case "session.status": {
                  const sp = payload.properties as { sessionID?: string; status?: SessionStatus }
                  const id = sp?.sessionID ?? payload.sessionID
                  if (!id || !sp?.status) break
                  const prevStatus = store.sessionStatus[id]
                  const wasBusy = prevStatus?.type === "busy" || prevStatus?.type === "retry"
                  const nowIdle = sp.status.type === "idle"
                  setSessionStatus(id, sp.status)
                  if (wasBusy && nowIdle) {
                    setStore("unread", id, true)
                  }
                  summaryChanged = true
                  break
                }
                case "question.asked": {
                  const q = payload.properties as QuestionRequest
                  if (q?.id) { addQuestion(q); summaryChanged = true }
                  break
                }
                case "question.replied":
                case "question.rejected": {
                  const props = payload.properties as { sessionID?: string; requestID?: string }
                  removeQuestion(props?.sessionID ?? "", props?.requestID ?? "")
                  summaryChanged = true
                  break
                }
                case "permission.asked": {
                  const p = payload.properties as PermissionRequest
                  if (p?.id) { addPermission(p); summaryChanged = true }
                  break
                }
                case "permission.replied": {
                  const props = payload.properties as { sessionID?: string; requestID?: string }
                  removePermission(props?.sessionID ?? "", props?.requestID ?? "")
                  summaryChanged = true
                  break
                }
                case "vcs.branch.updated": {
                  const props = payload.properties as { branch?: string }
                  if (props?.branch == null) break
                  const prev = store.vcs
                  if (prev?.branch === props.branch) break
                  setStore("vcs", { ...prev, branch: props.branch })
                  summaryChanged = true
                  break
                }
              }
              if (summaryChanged && props.workspaceId) {
                syncSummary(props.workspaceId, {
                  vcs: store.vcs,
                  sessionStatus: store.sessionStatus,
                  questions: store.questions,
                  permissions: store.permissions,
                  hasUnreadSession: store.session.some((s) => !s.parentID && store.unread[s.id]),
                })
              }
              dispatch(payload)
            })
          }
        } catch (e) {
          if ((e as any)?.name === "AbortError") return
        }
      }
      void readLoop()
    } catch (e) {
      if ((e as any)?.name === "AbortError") return
    }
  }

  onCleanup(() => {
    streamAbort?.abort()
    streamAbort = undefined
    if (props.workspaceId) clearSummary(props.workspaceId)
  })

  const projectValue = createMemo(() => ({
    id: device.directory,
    worktree: device.directory,
    name: undefined as string | undefined,
    time: { created: Date.now(), updated: Date.now() },
  }))

  const value: DeviceWorkspaceValue = {
    get data() { return store },
    ready: () => store.status !== "loading",
    agentAvailable: () => store.agentAvailable,
    get project() { return projectValue() },
    session: {
      get: getSession,
      fetch: fetchSessions,
      remove: deleteSession,
      setStatus: setSessionStatus,
      setQuestions: (q: Record<string, QuestionRequest[]>) => setStore("questions", reconcile(q)),
      setPermissions: (p: Record<string, PermissionRequest[]>) => setStore("permissions", reconcile(p)),
      removePermission,
      clearUnread: (id: string) => {
        if (!store.unread[id]) return
        batch(() => {
          setStore("unread", produce((draft) => { delete draft[id] }))
          if (props.workspaceId) {
            syncSummary(props.workspaceId, {
              vcs: store.vcs,
              sessionStatus: store.sessionStatus,
              questions: store.questions,
              permissions: store.permissions,
              hasUnreadSession: store.session.some((s) => !s.parentID && store.unread[s.id]),
            })
          }
        })
      },
    },
    command: { load: loadCommands },
    vcs: { load: loadVcs },
    subscribe,
    directory: device.directory,
    workspaceId: props.workspaceId,
  }

  return <DeviceWorkspaceContext.Provider value={value}>{props.children}</DeviceWorkspaceContext.Provider>
}
