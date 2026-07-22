import { createContext, useContext } from "solid-js"

type GlobalSDKValue = {
  client: any
  url: string
  createClient: (input: any) => any
  event: {
    on: (directory: string, callback: (event: any) => void) => () => void
  }
}

export const GlobalSDKContext = createContext<GlobalSDKValue>()

export function useGlobalSDK() {
  const ctx = useContext(GlobalSDKContext)
  if (!ctx) throw new Error("GlobalSDK context must be used within a context provider")
  return ctx
}
