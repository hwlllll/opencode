import { Bus } from "@/bus"
import { Installation } from "@/installation"

export async function upgrade() {
  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return

  if (Installation.compareVersions(latest, Installation.VERSION) <= 0) return

  await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
}
