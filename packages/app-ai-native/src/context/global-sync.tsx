import { createContext, useContext } from "solid-js"

type GlobalSyncValue = {
  data: {
    ready: boolean
    error: string | undefined
    session_todo: Record<string, any[]>
    [key: string]: any
  }
  set: (...args: any[]) => void
  ready: boolean
  error: string | undefined
  child: (dir?: string, options?: { bootstrap?: boolean }) => readonly [any, (...args: any[]) => void]
  bootstrap: () => Promise<void>
  project: {
    loadSessions: () => Promise<void>
    meta: (...args: any[]) => any
    icon: (...args: any[]) => any
  }
  todo: { set: () => void }
}

export const GlobalSyncContext = createContext<GlobalSyncValue>()

export function useGlobalSync() {
  const ctx = useContext(GlobalSyncContext)
  if (!ctx) throw new Error("GlobalSync context must be used within a context provider")
  return ctx
}
