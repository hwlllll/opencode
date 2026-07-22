import { Component, createMemo } from "solid-js"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { useLanguage } from "@/context/language"
import { useWorkspaceNavigate } from "@/hooks/use-workspace-navigate"

export const DialogSessionList: Component = () => {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const language = useLanguage()
  const { navigateToSession } = useWorkspaceNavigate()

  const sessions = createMemo(() => {
    const dir = sdk.directory
    if (!dir) return (sync.data.session as any[]).slice(0, 20)
    return (sync.data.session as any[])
      .filter((s) => s.directory === dir)
      .slice(0, 20)
  })

  return (
    <Dialog
      title={language.t("command.sessions.title")}
      description={language.t("command.sessions.description")}
    >
      <List
        items={sessions() as any[]}
        key={(s) => s.id}
        onSelect={(item) => {
          if (!item) return
          navigateToSession(item.id, {})
          dialog.close()
        }}
      >
        {(s) => (
          <div class="flex flex-col">
            <span class="text-sm font-medium">{s.title || language.t("common.untitled")}</span>
            <span class="text-xs text-foreground-muted">{new Date(s.time.created).toLocaleDateString()}</span>
          </div>
        )}
      </List>
    </Dialog>
  )
}
