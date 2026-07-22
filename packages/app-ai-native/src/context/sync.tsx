import { createContext, useContext } from "solid-js"

export const SyncContext = createContext<any>()

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error("Sync context must be used within a context provider")
  return ctx
}
