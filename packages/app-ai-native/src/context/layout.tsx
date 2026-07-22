import { createContext, useContext } from "solid-js"
import { type Project } from "@opencode-ai/sdk/v2"
import { type Accessor } from "solid-js"

const AVATAR_COLOR_KEYS = ["pink", "mint", "orange", "purple", "cyan", "lime"] as const
export type AvatarColorKey = (typeof AVATAR_COLOR_KEYS)[number]

export type LocalProject = Partial<Project> & { worktree: string; expanded: boolean }
export type ReviewDiffStyle = "unified" | "split"

export function getAvatarColors(key?: string) {
  const hash = key
    ? key.split("").reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
    : 0
  const index = Math.abs(hash) % AVATAR_COLOR_KEYS.length
  const bg = AVATAR_COLOR_KEYS[index]
  const text = AVATAR_COLOR_KEYS[(index + 3) % AVATAR_COLOR_KEYS.length]
  return { bg, text }
}

type LayoutValue = {
  ready: Accessor<boolean>
  handoff: {
    tabs: Accessor<{ dir: string; id: string; at: number } | undefined>
    setTabs: (dir: string, id: string) => void
    clearTabs: () => void
  }
  projects: {
    list: Accessor<LocalProject[]>
    open: (directory: string) => void
    close: (directory: string) => void
    expand: (directory: string) => void
    collapse: (directory: string) => void
    move: (directory: string, toIndex: number) => void
  }
  sidebar: {
    opened: Accessor<boolean>
    open: () => void
    close: () => void
    toggle: () => void
    width: Accessor<number>
    resize: (width: number) => void
    workspaces: (directory: string) => Accessor<boolean>
    setWorkspaces: (directory: string, value: boolean) => void
    toggleWorkspaces: (directory: string) => void
  }
  terminal: {
    height: Accessor<number>
    width?: Accessor<number>
    resize: (height: number) => void
  }
  review: {
    diffStyle: Accessor<ReviewDiffStyle>
    setDiffStyle: (diffStyle: ReviewDiffStyle) => void
  }
  fileTree: {
    opened: Accessor<boolean>
    width: Accessor<number>
    tab: Accessor<"changes" | "all">
    setTab: (tab: "changes" | "all") => void
    open: () => void
    close: () => void
    toggle: () => void
    resize: (width: number) => void
  }
  session: {
    width: Accessor<number>
    resize: (width: number) => void
  }
  mobileSidebar: {
    opened: Accessor<boolean>
    show: () => void
    hide: () => void
    toggle: () => void
  }
  pendingMessage: {
    set: (sessionKey: string, messageID: string) => void
    consume: (sessionKey: string) => string | undefined
  }
  view: (sessionKey: string | Accessor<string>) => {
    scroll: (tab: string) => { x: number; y: number } | undefined
    setScroll: (tab: string, pos: { x: number; y: number }) => void
    terminal: {
      opened: Accessor<boolean>
      open: () => void
      close: () => void
      toggle: () => void
    }
    reviewPanel: {
      opened: Accessor<boolean>
      open: () => void
      close: () => void
      toggle: () => void
    }
    review: {
      open: Accessor<string[] | undefined>
      setOpen: (open: string[]) => void
    }
  }
  tabs: (sessionKey: string | Accessor<string>) => {
    tabs: Accessor<{ all: string[]; active?: string }>
    active: Accessor<string | undefined>
    all: Accessor<string[]>
    setActive: (tab: string | undefined) => void
    setAll: (all: string[]) => void
    open: (tab: string) => Promise<void>
    close: (tab: string) => void
    move: (tab: string, to: number) => void
  }
}

export const LayoutContext = createContext<LayoutValue>()

export function useLayout(): LayoutValue {
  const value = useContext(LayoutContext)
  if (!value) throw new Error("Layout context must be used within a context provider")
  return value
}
