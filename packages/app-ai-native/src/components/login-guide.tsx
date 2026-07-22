import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation } from "@solidjs/router"
import { useAuth } from "@/context/auth"
import { getLoginUrl } from "@/pages/store/lib/auth"
import { useLanguage } from "@/context/language"

export default function LoginGuide() {
  const auth = useAuth()
  const language = useLanguage()
  const location = useLocation()

  const [store, setState] = createStore({
    visible: !sessionStorage.getItem("login-guide-dismissed"),
  })

  const show = () => {
    if (auth.loading()) return false
    if (auth.user()) return false
    const path = location.pathname
    if (!path.startsWith("/workspace") && !path.startsWith("/store") && !path.startsWith("/projects")) return false
    if (path.startsWith("/store/dashboard")) return false
    return store.visible
  }

  function dismiss() {
    sessionStorage.setItem("login-guide-dismissed", "1")
    setState("visible", false)
  }

  return (
    <Show when={show()}>
      {/* Spotlight overlay: dark mask with tight radial cutout centered on the sign-in button */}
      {/* Sidebar w-12 (48px), center x=24px; bottom stack: py-3(12) + help(40) + gap(8) + settings(40) + gap(8) + UserButton center = ~88px from bottom */}
      <div
        class="fixed inset-0 z-90 pointer-events-none animate-in fade-in duration-400"
        style={{
          background:
            "radial-gradient(ellipse 30px 30px at 24px calc(100% - 108px), transparent 0%, transparent 55%, rgba(0,0,0,0.6) 80%)",
        }}
      />

      {/* Guide card */}
      <div class="fixed bottom-22 left-6 z-100 flex items-end gap-0 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* curved arrow pointing to the Sign In button */}
        <div class="pointer-events-none self-end pb-4 pr-2">
          <svg
            width="120"
            height="60"
            viewBox="0 0 120 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            class="text-text-weak drop-shadow-sm"
          >
            <path
              d="M116 8 C90 8, 50 20, 16 50"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              fill="none"
            />
            <path
              d="M16 50 L22 38 M16 50 L28 48"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <div
          class="w-72 rounded-xl shadow-2xl bg-surface-raised-base border border-border-base p-4"
          style={{
            "box-shadow": "0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-13-medium text-text-strong">
              {language.t("loginGuide.title") || "Sign in to unlock more"}
            </span>
            <button
              type="button"
              aria-label={language.t("loginGuide.close") || "Close"}
              onClick={dismiss}
              class="text-text-weak hover:text-text-base transition-colors ml-2 shrink-0 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <p class="text-12-regular text-text-weak mb-3">
            {language.t("loginGuide.description") || "Sign in to access the Skill Store and manage your capabilities."}
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = getLoginUrl()
            }}
            class="w-full rounded-lg bg-primary-base text-white text-13-medium py-1.5 hover:bg-primary-base/90 transition-colors"
          >
            {language.t("loginGuide.login") || "Sign In"}
          </button>
        </div>
      </div>
    </Show>
  )
}
