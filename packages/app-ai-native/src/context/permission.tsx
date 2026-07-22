import { createContext, useContext } from "solid-js"

export type PermissionRespondFn = (input: {
  sessionID: string
  permissionID: string
  response: "once" | "always" | "reject"
  directory?: string
}) => void

export type PermissionValue = {
  ready: () => boolean
  respond: PermissionRespondFn
  autoResponds: (permission?: any) => boolean
  isAutoAccepting: (sessionID?: string) => boolean
  toggleAutoAccept: (sessionID?: string, directory?: string) => void
  enableAutoAccept: (sessionID?: string, directory?: string) => void
  disableAutoAccept: (sessionID?: string) => void
  permissionsEnabled: () => boolean
}

export const PermissionContext = createContext<PermissionValue>()

export function usePermission() {
  const ctx = useContext(PermissionContext)
  if (!ctx) throw new Error("Permission context must be used within a context provider")
  return ctx
}
