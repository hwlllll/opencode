import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Flag } from "@/flag/flag"
import { Installation } from "@/installation"

export async function upgrade() {
  const config = await Config.getGlobal()
  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return

  if (Flag.OPENCODE_ALWAYS_NOTIFY_UPDATE) {
    await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
    return
  }

  if (Installation.compareVersions(latest, Installation.VERSION) <= 0) return
  if (config.autoupdate === false || Flag.OPENCODE_DISABLE_AUTOUPDATE) return

  await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
}
