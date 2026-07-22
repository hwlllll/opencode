import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useLanguage } from "@/context/language"
import { projectsApi } from "../lib/project-api"
import type { ProjectRepository, ProjectRepositoryCandidate } from "../lib/project-types"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

type BindingsTab = "bound" | "available"

const CANDIDATE_POLL_INTERVAL_MS = 30_000

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  repositories: ProjectRepository[]
  canManage: boolean
  resolveUserName: (userId: string) => string
  onChanged?: () => void
}

export default function ProjectRepositoryBindingsDrawer(props: Props) {
  const language = useLanguage()
  const [store, setStore] = createStore({
    tab: "bound" as BindingsTab,
    gitRepoUrl: "",
    displayName: "",
    binding: false,
    candidateBindingUrl: "",
    unbindingId: "",
    candidateLoading: false,
    candidateSearch: "",
    candidateItems: [] as ProjectRepositoryCandidate[],
    candidateInitialized: false,
    candidateLoadedProjectId: "",
    error: "",
  })

  const repoUrlError = createMemo(() => {
    const value = store.gitRepoUrl.trim()
    if (!value) return ""
    const looksLikeGit =
      value.startsWith("git@") ||
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      /^[\w.-]+\/[\w.-]+/.test(value)
    return looksLikeGit ? "" : language.t("projects.bindingsDrawer.validation.gitRepoUrl")
  })

  const filteredCandidates = createMemo(() => {
    const keyword = store.candidateSearch.trim().toLowerCase()
    if (!keyword) return store.candidateItems
    return store.candidateItems.filter(
      (repo) => repo.gitRepoUrl.toLowerCase().includes(keyword) || repo.displayName.toLowerCase().includes(keyword),
    )
  })

  const loadCandidates = async () => {
    if (store.candidateLoading) return
    setStore("candidateLoading", true)
    setStore("error", "")
    try {
      const res = await projectsApi.listRepositoryCandidates(props.projectId, 30)
      const bound = new Set(props.repositories.map((repo) => repo.gitRepoUrl))
      setStore("candidateItems", (res.repositories ?? []).filter((repo) => !bound.has(repo.gitRepoUrl)))
      setStore("candidateLoadedProjectId", props.projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        variant: "error",
        title: language.t("projects.bindingsDrawer.preview.toast.failed"),
        description: message,
      })
    } finally {
      setStore("candidateLoading", false)
    }
  }

  createEffect(() => {
    if (!props.open) {
      if (store.candidateInitialized) {
        setStore("candidateInitialized", false)
        setStore("candidateLoadedProjectId", "")
      }
      return
    }

    if (!store.candidateInitialized) {
      setStore("candidateInitialized", true)
      void loadCandidates()
    }

    const interval = window.setInterval(() => {
      void loadCandidates()
    }, CANDIDATE_POLL_INTERVAL_MS)

    onCleanup(() => {
      window.clearInterval(interval)
    })
  })

  const bindRepository = async (gitRepoUrl: string, displayName?: string) => {
    setStore("binding", true)
    setStore("error", "")
    try {
      await projectsApi.bindRepository(props.projectId, { gitRepoUrl, displayName })
      showToast({ variant: "success", title: language.t("projects.bindingsDrawer.toast.bound") })
      props.onChanged?.()
      await loadCandidates()
      setStore("gitRepoUrl", "")
      setStore("displayName", "")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        variant: "error",
        title: language.t("projects.bindingsDrawer.toast.bindFailed"),
        description: message,
      })
    } finally {
      setStore("binding", false)
    }
  }

  const bindManual = async (e: SubmitEvent) => {
    e.preventDefault()
    if (!store.gitRepoUrl.trim() || repoUrlError()) return
    await bindRepository(store.gitRepoUrl.trim(), store.displayName.trim() || undefined)
  }

  const bindCandidate = async (candidate: ProjectRepositoryCandidate) => {
    setStore("candidateBindingUrl", candidate.gitRepoUrl)
    try {
      await bindRepository(candidate.gitRepoUrl, candidate.displayName || undefined)
    } finally {
      setStore("candidateBindingUrl", "")
    }
  }

  const unbind = async (repoBindingId: string) => {
    setStore("unbindingId", repoBindingId)
    setStore("error", "")
    try {
      await projectsApi.unbindRepository(props.projectId, repoBindingId)
      showToast({ variant: "success", title: language.t("projects.bindingsDrawer.toast.unbound") })
      props.onChanged?.()
      await loadCandidates()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        variant: "error",
        title: language.t("projects.bindingsDrawer.toast.unbindFailed"),
        description: message,
      })
    } finally {
      setStore("unbindingId", "")
    }
  }

  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open)
      }}
      modal={false}
    >
      <SheetContent position="right" class="w-[min(42rem,92vw)] !p-0 sm:max-w-none" style={{ "background-color": "var(--st-surface-lowest, #ffffff)" }}>
        <SheetHeader class="sr-only">
          <SheetTitle>{language.t("projects.bindingsDrawer.title")}</SheetTitle>
          <SheetDescription>{language.t("projects.bindingsDrawer.description")}</SheetDescription>
        </SheetHeader>

        <div class="flex h-full min-h-0 flex-col">
          <div class="flex-1 overflow-y-auto px-6 pb-6 pt-6">
            <div class="mb-6">
              <p class="mb-3 inline-flex items-center gap-[0.3rem] rounded-[var(--native-radius-full)] bg-[color-mix(in_srgb,var(--native-primary)_8%,transparent)] px-2.5 py-[0.1875rem] text-[12px] uppercase tracking-[0.08em] text-[var(--native-primary)]">{language.t("projects.actions.manageRepositoryBindings")}</p>
              <h2 class="m-0 text-2xl leading-[1.15] font-extrabold tracking-[-0.035em] text-[var(--native-foreground)]">{language.t("projects.bindingsDrawer.title")}</h2>
              <p class="mt-2 max-w-[38rem] text-[0.8125rem] leading-6 text-[var(--native-muted)]">{language.t("projects.bindingsDrawer.description")}</p>
            </div>

            <div class="mb-4 inline-flex items-center gap-1 rounded-[var(--native-radius-full)] border border-[color:color-mix(in_srgb,var(--native-border)_12%,transparent)] bg-[color-mix(in_srgb,var(--native-surface)_70%,transparent)] p-[0.1875rem]" role="tablist" aria-label={language.t("projects.bindingsDrawer.title")}>
              <For each={["bound", "available"] as const}>
                {(tab) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={store.tab === tab}
                    class={[
                      store.tab === tab
                        ? "inline-flex items-center whitespace-nowrap rounded-[var(--native-radius-full)] border-none bg-[var(--native-primary)] px-3 py-[0.3125rem] text-[0.8125rem] text-[var(--native-primary-foreground)] shadow-[0_1px_4px_color-mix(in_srgb,var(--native-primary)_25%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--native-primary)_85%,white)] hover:text-[var(--native-primary-foreground)]"
                        : "inline-flex items-center whitespace-nowrap rounded-[var(--native-radius-full)] border-none bg-transparent px-3 py-[0.3125rem] text-[0.8125rem] text-[var(--native-muted)] transition-all hover:bg-[color-mix(in_srgb,var(--native-panel)_70%,transparent)] hover:text-[var(--native-primary)]",
                    ].join(" ")}
                    onClick={() => setStore("tab", tab)}
                  >
                    {language.t(`projects.bindingsDrawer.tab.${tab}`)}
                  </button>
                )}
              </For>
            </div>

            <Show when={store.tab === "bound"}>
              <div class="rounded-xl border border-border-weak-base bg-surface-raised-base p-4 min-h-[20rem] flex flex-col">
                <div class="mb-4">
                  <h3 class="text-[1rem] font-semibold text-foreground">{language.t("projects.bindingsDrawer.listTitle")}</h3>
                </div>

                <Show
                  when={props.repositories.length > 0}
                  fallback={
                    <div class="flex flex-1 items-center justify-center">
                      <div class="max-w-sm text-center">
                        <div class="text-[1rem] font-semibold text-foreground">
                          {language.t("projects.bindingsDrawer.empty.title")}
                        </div>
                        <p class="mt-2 text-sm text-muted-foreground">
                          {language.t("projects.bindingsDrawer.empty.description")}
                        </p>
                        <p class="mt-2 text-xs text-muted-foreground">
                          {language.t("projects.bindingsDrawer.empty.hint")}
                        </p>
                      </div>
                    </div>
                  }
                >
                  <div class="flex flex-col gap-3">
                    <For each={props.repositories}>
                      {(repo) => (
                        <div class="rounded-lg border border-border/60 p-3">
                          <div class="flex items-start justify-between gap-4">
                            <div class="min-w-0">
                              <div class="truncate font-medium text-foreground">{repo.displayName || repo.gitRepoUrl}</div>
                              <div class="mt-1 truncate text-xs text-muted-foreground">{repo.gitRepoUrl}</div>
                              <div class="mt-2 text-xs text-muted-foreground">
                                {language.t("projects.detail.repositorySource")}: {repo.source} · {language.t("projects.detail.repositoryBoundBy")}: {props.resolveUserName(repo.boundByUserId)}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="small"
                              disabled={!props.canManage || store.unbindingId === repo.id}
                              onClick={() => void unbind(repo.id)}
                            >
                              {language.t("projects.bindingsDrawer.unbind")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>

            <Show when={store.tab === "available"}>
              <div class="space-y-6">
                <form onSubmit={bindManual} class="rounded-xl border border-border-weak-base bg-surface-raised-base p-4">
                  <div class="grid gap-4">
                    <div>
                      <label class="mb-2 block text-12-medium text-text-strong">{language.t("projects.bindingsDrawer.field.gitRepoUrl")}</label>
                      <input
                        value={store.gitRepoUrl}
                        onInput={(e) => setStore("gitRepoUrl", e.currentTarget.value)}
                        placeholder={language.t("projects.bindingsDrawer.field.gitRepoUrlPlaceholder")}
                        class={inputClass}
                        disabled={!props.canManage}
                      />
                      <Show when={repoUrlError()}>
                        <p class="mt-2 text-xs text-red-500">{repoUrlError()}</p>
                      </Show>
                      <Show when={!repoUrlError()}>
                        <p class="mt-2 text-xs text-muted-foreground">{language.t("projects.bindingsDrawer.validation.gitRepoUrlHint")}</p>
                      </Show>
                    </div>

                    <div>
                      <label class="mb-2 block text-12-medium text-text-strong">{language.t("projects.bindingsDrawer.field.displayName")}</label>
                      <input
                        value={store.displayName}
                        onInput={(e) => setStore("displayName", e.currentTarget.value)}
                        placeholder={language.t("projects.bindingsDrawer.field.displayNamePlaceholder")}
                        class={inputClass}
                        disabled={!props.canManage}
                      />
                    </div>

                    <div class="flex justify-end">
                      <Button type="submit" loading={store.binding} disabled={!props.canManage || !store.gitRepoUrl.trim() || !!repoUrlError() || store.binding}>
                        {language.t("projects.bindingsDrawer.bind")}
                      </Button>
                    </div>
                  </div>
                </form>

                <div class="rounded-xl border border-border-weak-base bg-surface-raised-base p-4">
                  <div class="mb-4">
                    <h3 class="text-[1rem] font-semibold text-foreground">{language.t("projects.bindingsDrawer.candidatesTitle")}</h3>
                    <p class="mt-1 text-sm text-muted-foreground">{language.t("projects.bindingsDrawer.candidatesDescription")}</p>
                  </div>

                  <input
                    value={store.candidateSearch}
                    onInput={(e) => setStore("candidateSearch", e.currentTarget.value)}
                    placeholder={language.t("projects.bindingsDrawer.preview.searchPlaceholder")}
                    class={`${inputClass} mb-4`}
                  />

                  <Show when={!store.candidateLoading} fallback={<div class="px-4 py-12 text-center text-[var(--native-muted)]">{language.t("store.loading")}</div>}>
                    <Show when={filteredCandidates().length > 0} fallback={<div class="px-4 py-12 text-center text-[var(--native-muted)]">{language.t("projects.bindingsDrawer.preview.empty")}</div>}>
                      <div class="flex flex-col gap-3">
                        <For each={filteredCandidates()}>
                          {(repo) => (
                            <div class="rounded-lg border border-border/60 p-3">
                              <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0">
                                  <div class="truncate font-medium text-foreground">{repo.displayName || repo.gitRepoUrl}</div>
                                  <div class="mt-1 truncate text-xs text-muted-foreground">{repo.gitRepoUrl}</div>
                                  <div class="mt-2 text-xs text-muted-foreground">
                                    {language.t("projects.activity.totalRequests")}: {repo.requestCount} · {language.t("projects.activity.lastActive")}: {repo.lastActiveDate || "—"}
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={!props.canManage || store.candidateBindingUrl === repo.gitRepoUrl}
                                  onClick={() => void bindCandidate(repo)}
                                >
                                  {language.t("projects.bindingsDrawer.candidateBind")}
                                </Button>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </div>
              </div>
            </Show>

            {store.error ? <div class="mt-4 text-sm text-red-500">{store.error}</div> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
