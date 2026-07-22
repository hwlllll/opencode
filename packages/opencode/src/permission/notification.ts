import { z } from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Instance } from "@/project/instance"
import { TuiEvent } from "@/cli/cmd/tui/event"
import { Global } from "@/global"
import path from "path"

export namespace NotificationMode {
  const Event = {
    Toggled: BusEvent.define("notification.toggled", z.object({ enabled: z.boolean() })),
  }

  const state = Instance.state(() => ({ enabled: true }))

  export function toggle() {
    const s = state()
    s.enabled = !s.enabled
    Bus.publish(Event.Toggled, { enabled: s.enabled })
    return s.enabled
  }

  export function isEnabled() {
    return state().enabled
  }

  export function setEnabled(enabled: boolean) {
    const s = state()
    s.enabled = enabled
    Bus.publish(Event.Toggled, { enabled })
  }

  export async function init() {
    const kvFile = Bun.file(path.join(Global.Path.state, "kv.json"))
    try {
      const kv = await kvFile.json()
      if (kv.notification_mode !== undefined) {
        setEnabled(kv.notification_mode)
      }
    } catch {}

    Bus.subscribe(TuiEvent.CommandExecute, (evt) => {
      if (evt.properties.command === "notification.toggle") {
        toggle()
      }
    })
  }
}
