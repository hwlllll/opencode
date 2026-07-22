import { createMemo, useContext } from "solid-js"
import { DeviceWorkspaceContext } from "@/context/device-workspace"

export function useProviders() {
  const workspace = useContext(DeviceWorkspaceContext)
  if (!workspace) throw new Error("useProviders must be used within DeviceWorkspaceContext")
  const connected = createMemo(() => workspace.data.provider.connected)
  const paid = createMemo(() =>
    connected().filter((p: any) => p.id !== "opencode" || Object.values(p.models).find((m: any) => m.cost?.input)),
  )
  return { connected, paid }
}
