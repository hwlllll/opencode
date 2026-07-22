import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Popover } from "@opencode-ai/ui/popover"
import { Switch } from "@opencode-ai/ui/switch"
import { Tabs } from "@opencode-ai/ui/tabs"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"

const useMcpToggle = (input: {
  sync: ReturnType<typeof useSync>
  sdk: ReturnType<typeof useSDK>
  language: ReturnType<typeof useLanguage>
}) => {
  const [loading, setLoading] = createSignal<string | null>(null)

  const toggle = async (name: string) => {
    if (loading()) return
    setLoading(name)

    try {
      const status = input.sync.data.mcp[name]
      await (status?.status === "connected"
        ? input.sdk.client.mcp.disconnect({ name })
        : input.sdk.client.mcp.connect({ name }))
      const result = await input.sdk.client.runtime.mcpStatus(input.sdk.directory)
      if (result) input.sync.set("mcp", result as any)
    } catch (err) {
      showToast({
        variant: "error",
        title: input.language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(null)
    }
  }

  return { loading, toggle }
}

const useStatusLoad = (input: { sync: ReturnType<typeof useSync>; sdk: ReturnType<typeof useSDK> }) => {
  const [loaded, setLoaded] = createSignal(false)

  const load = async () => {
    if (loaded()) return
    setLoaded(true)
    const [mcp, lsp] = await Promise.allSettled([
      input.sdk.client.runtime.mcpStatus(input.sdk.directory),
      input.sdk.client.runtime.lspStatus(input.sdk.directory),
    ])
    if (mcp.status === "fulfilled" && mcp.value) input.sync.set("mcp", mcp.value as any)
    if (lsp.status === "fulfilled") input.sync.set("lsp", (lsp.value as any) ?? [])
  }

  return { load }
}

export function StatusPopover() {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()

  const mcp = useMcpToggle({ sync, sdk, language })
  const status = useStatusLoad({ sync, sdk })
  const mcpNames = createMemo(() => Object.keys(sync.data.mcp ?? {}).sort((a, b) => a.localeCompare(b)))
  const mcpStatus = (name: string) => sync.data.mcp?.[name]?.status
  const mcpConnected = createMemo(() => mcpNames().filter((name) => mcpStatus(name) === "connected").length)
  const lspItems = createMemo(() => sync.data.lsp ?? [])
  const lspCount = createMemo(() => lspItems().length)

  return (
    <Popover
      triggerAs={Button}
      triggerProps={{
        variant: "ghost",
        class: "titlebar-icon w-6 h-6 p-0 box-border",
        "aria-label": language.t("status.popover.trigger"),
        style: { scale: 1 },
      }}
      trigger={
        <div class="flex size-4 items-center justify-center">
          <div
            classList={{
              "size-1.5 rounded-full": true,
              "bg-icon-success-base": mcpConnected() > 0,
              "bg-border-weak-base": mcpConnected() === 0,
            }}
          />
        </div>
      }
      class="[&_[data-slot=popover-body]]:p-0 w-[360px] max-w-[calc(100vw-40px)] bg-transparent border-0 shadow-none rounded-xl"
      gutter={4}
      placement="bottom-end"
      shift={-168}
      onOpenChange={(open) => {
        if (!open) return
        void status.load()
      }}
    >
      <div class="flex items-center gap-1 w-[360px] rounded-xl shadow-[var(--shadow-lg-border-base)]">
        <Tabs
          aria-label={language.t("status.popover.ariaLabel")}
          class="tabs bg-background-strong rounded-xl overflow-hidden"
          data-component="tabs"
          data-active="mcp"
          defaultValue="mcp"
          variant="alt"
        >
          <Tabs.List data-slot="tablist" class="bg-transparent border-b-0 px-4 pt-2 pb-0 gap-4 h-10">
            <Tabs.Trigger value="mcp" data-slot="tab" class="text-12-regular">
              {mcpConnected() > 0 ? `${mcpConnected()} ` : ""}
              {language.t("status.popover.tab.mcp")}
            </Tabs.Trigger>
            <Tabs.Trigger value="lsp" data-slot="tab" class="text-12-regular">
              {lspCount() > 0 ? `${lspCount()} ` : ""}
              {language.t("status.popover.tab.lsp")}
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="mcp">
            <div class="flex flex-col px-2 pb-2">
              <div class="flex flex-col p-3 bg-background-base rounded-sm min-h-14">
                <Show
                  when={mcpNames().length > 0}
                  fallback={
                    <div class="text-14-regular text-text-base text-center my-auto">
                      {language.t("dialog.mcp.empty")}
                    </div>
                  }
                >
                  <For each={mcpNames()}>
                    {(name) => {
                      const s = () => mcpStatus(name)
                      const enabled = () => s() === "connected"
                      return (
                        <button
                          type="button"
                          class="flex items-center gap-2 w-full h-8 pl-3 pr-2 py-1 rounded-md hover:bg-surface-raised-base-hover transition-colors text-left"
                          onClick={() => mcp.toggle(name)}
                          disabled={mcp.loading() === name}
                        >
                          <div
                            classList={{
                              "size-1.5 rounded-full shrink-0": true,
                              "bg-icon-success-base": s() === "connected",
                              "bg-icon-critical-base": s() === "failed",
                              "bg-border-weak-base": s() === "disabled",
                              "bg-icon-warning-base":
                                s() === "needs_auth" || s() === "needs_client_registration",
                            }}
                          />
                          <span class="text-14-regular text-text-base truncate flex-1">{name}</span>
                          <div onClick={(event) => event.stopPropagation()}>
                            <Switch
                              checked={enabled()}
                              disabled={mcp.loading() === name}
                              onChange={() => mcp.toggle(name)}
                            />
                          </div>
                        </button>
                      )
                    }}
                  </For>
                </Show>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="lsp">
            <div class="flex flex-col px-2 pb-2">
              <div class="flex flex-col p-3 bg-background-base rounded-sm min-h-14">
                <Show
                  when={lspItems().length > 0}
                  fallback={
                    <div class="text-14-regular text-text-base text-center my-auto">
                      {language.t("dialog.lsp.empty")}
                    </div>
                  }
                >
                  <For each={lspItems()}>
                    {(item) => (
                      <div class="flex items-center gap-2 w-full px-2 py-1">
                        <div
                          classList={{
                            "size-1.5 rounded-full shrink-0": true,
                            "bg-icon-success-base": item.status === "connected",
                            "bg-icon-critical-base": item.status === "error",
                          }}
                        />
                        <span class="text-14-regular text-text-base truncate">{item.name || item.id}</span>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    </Popover>
  )
}
