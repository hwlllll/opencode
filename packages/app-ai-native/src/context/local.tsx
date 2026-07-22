import { createContext, useContext } from "solid-js"

export const LocalContext = createContext<any>()

export function useLocal() {
  const ctx = useContext(LocalContext)
  if (!ctx) throw new Error("Local context must be used within a context provider")
  return ctx
}
