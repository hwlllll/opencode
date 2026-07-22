import { Show, createEffect, createSignal, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function StatusDisplay(props: { working: boolean; busySince?: number }) {
  const language = useLanguage()
  const [elapsed, setElapsed] = createSignal(0)

  createEffect(() => {
    if (!props.working) {
      setElapsed(0)
      return
    }

    const start = props.busySince ?? Date.now()
    setElapsed(Math.floor((Date.now() - start) / 1000))
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    onCleanup(() => clearInterval(timer))
  })

  return (
    <Show when={props.working}>
      <div class="flex items-center gap-2 px-3 py-1.5 text-12-regular text-text-weak">
        <div class="size-3 rounded-full border border-t-transparent animate-spin border-text-weak" />
        <span>{language.t("session.status.processing")}</span>
        <span class="opacity-60">({formatElapsedTime(elapsed())})</span>
      </div>
    </Show>
  )
}
