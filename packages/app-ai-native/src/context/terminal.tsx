import { type ParentProps } from "solid-js"
import { useDeviceTerminal, type LocalPTY } from "@/context/device-terminal"

export type { LocalPTY }

export function TerminalProvider(props: ParentProps) {
  return <>{props.children}</>
}

export function useTerminal() {
  return useDeviceTerminal()
}
