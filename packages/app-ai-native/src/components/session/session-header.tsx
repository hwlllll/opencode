import { AppIcon } from "@opencode-ai/ui/app-icon"
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Keybind } from "@opencode-ai/ui/keybind"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { getFilename } from "@opencode-ai/util/path"
import { createEffect, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { Persist, persisted } from "@/utils/persist"
import { StatusPopover } from "../status-popover"

const OPEN_APPS = [
  "vscode",
  "cursor",
  "zed",
  "textmate",
  "antigravity",
  "finder",
  "terminal",
  "iterm2",
  "ghostty",
  "warp",
  "xcode",
  "android-studio",
  "powershell",
  "sublime-text",
] as const

type OpenApp = (typeof OPEN_APPS)[number]
type OS = "macos" | "windows" | "linux" | "unknown"

const MAC_APPS = [
  {
    id: "vscode",
    label: "VS Code",
    icon: "vscode",
    openWith: "Visual Studio Code",
  },
  { id: "cursor", label: "Cursor", icon: "cursor", openWith: "Cursor" },
  { id: "zed", label: "Zed", icon: "zed", openWith: "Zed" },
  { id: "textmate", label: "TextMate", icon: "textmate", openWith: "TextMate" },
  {
    id: "antigravity",
    label: "Antigravity",
    icon: "antigravity",
    openWith: "Antigravity",
  },
  { id: "terminal", label: "Terminal", icon: "terminal", openWith: "Terminal" },
  { id: "iterm2", label: "iTerm2", icon: "iterm2", openWith: "iTerm" },
  { id: "ghostty", label: "Ghostty", icon: "ghostty", openWith: "Ghostty" },
  { id: "warp", label: "Warp", icon: "warp", openWith: "Warp" },
  { id: "xcode", label: "Xcode", icon: "xcode", openWith: "Xcode" },
  {
    id: "android-studio",
    label: "Android Studio",
    icon: "android-studio",
    openWith: "Android Studio",
  },
  {
    id: "sublime-text",
    label: "Sublime Text",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

const WINDOWS_APPS = [
  { id: "vscode", label: "VS Code", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "Cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "Zed", icon: "zed", openWith: "zed" },
  {
    id: "powershell",
    label: "PowerShell",
    icon: "powershell",
    openWith: "powershell",
  },
  {
    id: "sublime-text",
    label: "Sublime Text",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

const LINUX_APPS = [
  { id: "vscode", label: "VS Code", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "Cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "Zed", icon: "zed", openWith: "zed" },
  {
    id: "sublime-text",
    label: "Sublime Text",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

type OpenOption = (typeof MAC_APPS)[number] | (typeof WINDOWS_APPS)[number] | (typeof LINUX_APPS)[number]
type OpenIcon = OpenApp | "file-explorer"
const OPEN_ICON_BASE = new Set<OpenIcon>(["finder", "vscode", "cursor", "zed"])

const openIconSize = (id: OpenIcon) => (OPEN_ICON_BASE.has(id) ? "size-4" : "size-[19px]")

const detectOS = (platform: ReturnType<typeof usePlatform>): OS => {
  if (platform.platform === "desktop" && platform.os) return platform.os
  if (typeof navigator !== "object") return "unknown"
  const value = navigator.platform || navigator.userAgent
  if (/Mac/i.test(value)) return "macos"
  if (/Win/i.test(value)) return "windows"
  if (/Linux/i.test(value)) return "linux"
  return "unknown"
}

const showRequestError = (language: ReturnType<typeof useLanguage>, err: unknown) => {
  showToast({
    variant: "error",
    title: language.t("common.requestFailed"),
    description: err instanceof Error ? err.message : String(err),
  })
}

export function SessionHeader() {
  const layout = useLayout()
  const command = useCommand()
  const sync = useSync()
  const sdk = useSDK()
  const platform = usePlatform()
  const language = useLanguage()

  const workspaceDirectory = createMemo(() => sdk.directory ?? "")
  const workspace = createMemo(() => {
    const directory = workspaceDirectory()
    if (!directory) return
    return layout.projects.list().find((p) => p.worktree === directory || p.sandboxes?.includes(directory))
  })
  const name = createMemo(() => {
    const current = workspace()
    if (current) return current.name || getFilename(current.worktree)
    return getFilename(workspaceDirectory())
  })
  const hotkey = createMemo(() => command.keybind("file.open"))

  const sessionKey = createMemo(() => ((sync as any).currentSessionID?.() ?? ""))
  const view = createMemo(() => layout.view(sessionKey))
  const os = createMemo(() => detectOS(platform))

  const [exists, setExists] = createStore<Partial<Record<OpenApp, boolean>>>({
    finder: true,
  })

  const apps = createMemo(() => {
    if (os() === "macos") return MAC_APPS
    if (os() === "windows") return WINDOWS_APPS
    return LINUX_APPS
  })

  const fileManager = createMemo(() => {
    if (os() === "macos") return { label: "Finder", icon: "finder" as const }
    if (os() === "windows") return { label: "File Explorer", icon: "file-explorer" as const }
    return { label: "File Manager", icon: "finder" as const }
  })

  createEffect(() => {
    if (platform.platform !== "desktop") return
    if (!platform.checkAppExists) return

    const list = apps()

    setExists(Object.fromEntries(list.map((app) => [app.id, undefined])) as Partial<Record<OpenApp, boolean>>)

    void Promise.all(
      list.map((app) =>
        Promise.resolve(platform.checkAppExists?.(app.openWith))
          .then((value) => Boolean(value))
          .catch(() => false)
          .then((ok) => {
            console.debug(`[session-header] App "${app.label}" (${app.openWith}): ${ok ? "exists" : "does not exist"}`)
            return [app.id, ok] as const
          }),
      ),
    ).then((entries) => {
      setExists(Object.fromEntries(entries) as Partial<Record<OpenApp, boolean>>)
    })
  })

  const options = createMemo(() => {
    return [
      { id: "finder", label: fileManager().label, icon: fileManager().icon },
      ...apps().filter((app) => exists[app.id]),
    ] as const
  })

  const [prefs, setPrefs] = persisted(Persist.global("open.app"), createStore({ app: "finder" as OpenApp }))

  const current = createMemo(() => options().find((o) => o.id === prefs.app) ?? options()[0])

  const selectApp = (app: OpenApp) => {
    if (!options().some((item) => item.id === app)) return
    setPrefs("app", app)
  }

  const copyPath = () => {
    const directory = workspaceDirectory()
    if (!directory) return
    navigator.clipboard
      .writeText(directory)
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("session.share.copy.copied"),
          description: directory,
        })
      })
      .catch((err: unknown) => showRequestError(language, err))
  }

  const centerMount = createMemo(() => document.getElementById("opencode-titlebar-center"))
  const rightMount = createMemo(() => document.getElementById("opencode-titlebar-right"))

  return (
    <>
      <Show when={centerMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <Button
              type="button"
              variant="ghost"
              size="small"
              class="hidden md:flex w-[240px] max-w-full min-w-0 pl-0.5 pr-2 items-center gap-2 justify-between rounded-md border border-border-weak-base bg-surface-panel shadow-none cursor-default"
              onClick={() => command.trigger("file.open")}
              aria-label={language.t("session.header.searchFiles")}
            >
              <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
                <Icon name="magnifying-glass" size="small" class="icon-base shrink-0 size-4" />
                <span class="flex-1 min-w-0 text-12-regular text-text-weak truncate text-left">
                  {language.t("session.header.search.placeholder", {
                    project: name(),
                  })}
                </span>
              </div>

              <Show when={hotkey()}>
                {(keybind) => (
                  <Keybind class="shrink-0 !border-0 !bg-transparent !shadow-none px-0">{keybind()}</Keybind>
                )}
              </Show>
            </Button>
          </Portal>
        )}
      </Show>
      <Show when={rightMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <div class="flex items-center gap-2">
              <StatusPopover />
              <Show when={workspaceDirectory()}>
                <div class="hidden xl:flex items-center">
                  <div class="flex h-[24px] box-border items-center rounded-md border border-border-weak-base bg-surface-panel overflow-hidden">
                    <Button
                      variant="ghost"
                      class="rounded-none h-full py-0 pr-3 pl-0.5 gap-1.5 border-none shadow-none"
                      onClick={copyPath}
                      aria-label={language.t("session.header.open.copyPath")}
                    >
                      <Icon name="copy" size="small" class="text-icon-base" />
                      <span class="text-12-regular text-text-strong">
                        {language.t("session.header.open.copyPath")}
                      </span>
                    </Button>
                  </div>
                </div>
              </Show>
              <div class="flex items-center gap-1">
                <div class="hidden md:flex items-center gap-1 shrink-0">
                  <TooltipKeybind
                    title={language.t("command.terminal.toggle")}
                    keybind={command.keybind("terminal.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="group/terminal-toggle titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => view().terminal.toggle()}
                      aria-label={language.t("command.terminal.toggle")}
                      aria-expanded={view().terminal.opened()}
                      aria-controls="terminal-panel"
                    >
                      <div class="relative flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
                        <Icon
                          size="small"
                          name={view().terminal.opened() ? "layout-bottom-partial" : "layout-bottom"}
                          class="group-hover/terminal-toggle:hidden"
                        />
                        <Icon
                          size="small"
                          name="layout-bottom-partial"
                          class="hidden group-hover/terminal-toggle:inline-block"
                        />
                        <Icon
                          size="small"
                          name={view().terminal.opened() ? "layout-bottom" : "layout-bottom-partial"}
                          class="hidden group-active/terminal-toggle:inline-block"
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>

                  <TooltipKeybind
                    title={language.t("command.review.toggle")}
                    keybind={command.keybind("review.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="group/review-toggle titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => view().reviewPanel.toggle()}
                      aria-label={language.t("command.review.toggle")}
                      aria-expanded={view().reviewPanel.opened()}
                      aria-controls="review-panel"
                    >
                      <div class="relative flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
                        <Icon
                          size="small"
                          name={view().reviewPanel.opened() ? "layout-right-partial" : "layout-right"}
                          class="group-hover/review-toggle:hidden"
                        />
                        <Icon
                          size="small"
                          name="layout-right-partial"
                          class="hidden group-hover/review-toggle:inline-block"
                        />
                        <Icon
                          size="small"
                          name={view().reviewPanel.opened() ? "layout-right" : "layout-right-partial"}
                          class="hidden group-active/review-toggle:inline-block"
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>

                  <TooltipKeybind
                    title={language.t("command.fileTree.toggle")}
                    keybind={command.keybind("fileTree.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => layout.fileTree.toggle()}
                      aria-label={language.t("command.fileTree.toggle")}
                      aria-expanded={layout.fileTree.opened()}
                      aria-controls="file-tree-panel"
                    >
                      <div class="relative flex items-center justify-center size-4">
                        <Icon
                          size="small"
                          name={layout.fileTree.opened() ? "file-tree-active" : "file-tree"}
                          classList={{
                            "text-icon-strong": layout.fileTree.opened(),
                            "text-icon-weak": !layout.fileTree.opened(),
                          }}
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </>
  )
}
