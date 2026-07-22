import { useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useLanguage } from "@/context/language"
import { projectsApi } from "../lib/project-api"
import type { Project } from "../lib/project-types"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

const textAreaClass =
  "w-full min-h-[96px] rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-sm text-text-strong outline-none focus:border-border-strong resize-y"

type Props = {
  project: Project
  canManage: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export default function EditProjectDialog(props: Props) {
  const navigate = useNavigate()
  const language = useLanguage()
  const [store, setStore] = createStore({
    name: props.project.name,
    description: props.project.description || "",
    enabledAt: props.project.enabledAt ? toDateTimeLocalValue(props.project.enabledAt) : "",
    archivedAt: props.project.archivedAt ? toDateTimeLocalValue(props.project.archivedAt) : "",
    isArchived: !!props.project.archivedAt,
    saving: false,
    archiving: false,
    deleting: false,
    error: "",
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!store.name.trim()) return

    setStore("saving", true)
    setStore("error", "")

    try {
      await projectsApi.update(props.project.id, {
        name: store.name.trim(),
        description: store.description.trim(),
        enabledAt: store.enabledAt ? new Date(store.enabledAt).toISOString() : undefined,
      })

      if (store.isArchived && store.archivedAt) {
        const originalArchivedAt = props.project.archivedAt ? toDateTimeLocalValue(props.project.archivedAt) : ""
        if (store.archivedAt !== originalArchivedAt) {
          await projectsApi.updateArchiveTime(props.project.id, new Date(store.archivedAt).toISOString())
        }
      }

      showToast({
        variant: "success",
        title: language.t("projects.editDialog.toast.success"),
      })
      props.onSaved?.()
      props.onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        variant: "error",
        title: language.t("projects.editDialog.toast.failed"),
        description: message,
      })
    } finally {
      setStore("saving", false)
    }
  }

  async function handleArchive(archived: boolean) {
    setStore("archiving", true)
    setStore("error", "")
    try {
      if (archived) {
        await projectsApi.unarchive(props.project.id)
        setStore("isArchived", false)
        setStore("archivedAt", "")
      } else {
        await projectsApi.archive(props.project.id)
        const now = new Date().toISOString()
        setStore("isArchived", true)
        setStore("archivedAt", toDateTimeLocalValue(now))
      }
      showToast({
        variant: "success",
        title: archived
          ? language.t("projects.editDialog.toast.unarchived")
          : language.t("projects.editDialog.toast.archived"),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        variant: "error",
        title: archived
          ? language.t("projects.editDialog.toast.unarchiveFailed")
          : language.t("projects.editDialog.toast.archiveFailed"),
        description: message,
      })
    } finally {
      setStore("archiving", false)
    }
  }

  async function handleDelete() {
    setStore("deleting", true)
    setStore("error", "")
    try {
      await projectsApi.remove(props.project.id)
      showToast({
        variant: "success",
        title: language.t("projects.editDialog.toast.deleted"),
      })
      props.onOpenChange(false)
      navigate("/projects")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        variant: "error",
        title: language.t("projects.editDialog.toast.deleteFailed"),
        description: message,
      })
    } finally {
      setStore("deleting", false)
    }
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange} modal={false}>
      <SheetContent position="right" class="w-[min(42rem,92vw)] !p-0 sm:max-w-none" style={{ "background-color": "var(--st-surface-lowest, #ffffff)" }}>
        <SheetHeader class="sr-only">
          <SheetTitle>{language.t("projects.editDialog.title")}</SheetTitle>
          <SheetDescription>{language.t("projects.editDialog.infoDescription")}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} class="flex h-full min-h-0 flex-col">
          <div class="flex-1 overflow-y-auto px-6 pb-6 pt-6">
            <div class="mb-6">
              <p class="mb-3 inline-flex items-center gap-[0.3rem] rounded-[var(--native-radius-full)] bg-[color-mix(in_srgb,var(--native-primary)_8%,transparent)] px-2.5 py-[0.1875rem] text-[12px] uppercase tracking-[0.08em] text-[var(--native-primary)]">{language.t("projects.actions.projectSettings")}</p>
              <h2 class="m-0 text-2xl leading-[1.15] font-extrabold tracking-[-0.035em] text-[var(--native-foreground)]">{props.project.name}</h2>
              <p class="mt-2 max-w-[38rem] text-[0.8125rem] leading-6 text-[var(--native-muted)]">{language.t("projects.editDialog.infoDescription")}</p>
            </div>

            <div class="rounded-xl border border-border-weak-base bg-surface-raised-base">
              <div class="border-b border-border-weak-base px-4 py-4">
                <div class="text-14-medium text-text-strong">{language.t("projects.editDialog.meta.title")}</div>
                <div class="mt-1 text-12-regular text-text-weak">{language.t("projects.editDialog.meta.description")}</div>
              </div>
              <div class="grid gap-3 px-4 py-4 text-sm text-text-weak sm:grid-cols-2">
                <div>
                  <div class="text-12-medium text-text-strong">{language.t("projects.editDialog.meta.projectId")}</div>
                  <div class="mt-1 break-all">{props.project.id}</div>
                </div>
                <div>
                  <div class="text-12-medium text-text-strong">{language.t("projects.editDialog.meta.createdAt")}</div>
                  <div class="mt-1">{formatDate(props.project.createdAt)}</div>
                </div>
                <div>
                  <div class="text-12-medium text-text-strong">{language.t("projects.editDialog.meta.updatedAt")}</div>
                  <div class="mt-1">{formatDate(props.project.updatedAt)}</div>
                </div>
                <div>
                  <div class="text-12-medium text-text-strong">{language.t("projects.editDialog.meta.status")}</div>
                  <div class="mt-1">
                    {props.project.archivedAt
                      ? language.t("projects.editDialog.meta.statusArchived")
                      : language.t("projects.editDialog.meta.statusActive")}
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-4 rounded-xl border border-border-weak-base bg-surface-raised-base">
              <div class="border-b border-border-weak-base px-4 py-4">
                <div class="text-14-medium text-text-strong">{language.t("projects.editDialog.info")}</div>
                <div class="mt-1 text-12-regular text-text-weak">{language.t("projects.editDialog.infoDescription")}</div>
              </div>

              <div class="grid gap-4 px-4 py-4">
                <div>
                  <label class="mb-2 block text-12-medium text-text-strong">
                    {language.t("projects.editDialog.field.name")} <span class="text-icon-info-base">*</span>
                  </label>
                  <input
                    autofocus
                    value={store.name}
                    onInput={(e) => setStore("name", e.currentTarget.value)}
                    placeholder={language.t("projects.createDialog.field.namePlaceholder")}
                    class={inputClass}
                    required
                    disabled={!props.canManage}
                  />
                </div>

                <div>
                  <label class="mb-2 block text-12-medium text-text-strong">
                    {language.t("projects.editDialog.field.description")}
                  </label>
                  <textarea
                    value={store.description}
                    onInput={(e) => setStore("description", e.currentTarget.value)}
                    placeholder={language.t("projects.createDialog.field.descriptionPlaceholder")}
                    class={textAreaClass}
                    disabled={!props.canManage}
                  />
                </div>

                <div>
                  <label class="mb-2 block text-12-medium text-text-strong">
                    {language.t("projects.editDialog.field.enabledAt")}
                  </label>
                    <input
                      type="datetime-local"
                      value={store.enabledAt}
                      onInput={(e) => setStore("enabledAt", e.currentTarget.value)}
                      class={inputClass}
                      disabled={!props.canManage || store.isArchived}
                    />
                    <p class="mt-2 text-xs text-text-weak">{language.t("projects.editDialog.field.enabledAtHint")}</p>
                </div>

                <Show when={store.isArchived}>
                  <div>
                    <label class="mb-2 block text-12-medium text-text-strong">
                      {language.t("projects.detail.archivedAtLabel")}
                    </label>
                    <input
                      type="datetime-local"
                      value={store.archivedAt}
                      onInput={(e) => setStore("archivedAt", e.currentTarget.value)}
                      class={inputClass}
                      disabled={!props.canManage}
                    />
                    <p class="mt-2 text-xs text-text-weak">{language.t("projects.editDialog.archive.archivedDescription")}</p>
                  </div>
                </Show>
              </div>
            </div>

            <div class="mt-4 rounded-xl border border-border-weak-base bg-surface-raised-base">
              <div class="border-b border-border-weak-base px-4 py-4">
                <div class="text-14-medium text-text-strong">{language.t("projects.editDialog.archive.title")}</div>
                <div class="mt-1 text-12-regular text-text-weak">
                  {store.isArchived
                    ? language.t("projects.editDialog.archive.archivedDescription")
                    : language.t("projects.editDialog.archive.activeDescription")}
                </div>
              </div>
              <div class="flex items-center justify-between gap-4 px-4 py-4">
                <div class="text-sm text-text-weak">
                  {store.isArchived
                    ? language.t("projects.editDialog.archive.archivedAt", { date: formatDate(store.archivedAt ? new Date(store.archivedAt).toISOString() : undefined) })
                    : language.t("projects.editDialog.archive.active")}
                </div>
                <Button
                  type="button"
                  variant={store.isArchived ? "secondary" : "ghost"}
                  loading={store.archiving}
                  disabled={!props.canManage || store.archiving}
                  onClick={() => void handleArchive(store.isArchived)}
                >
                  {store.isArchived
                    ? language.t("projects.editDialog.archive.unarchive")
                    : language.t("projects.editDialog.archive.archive")}
                </Button>
              </div>
            </div>

            <Show when={!props.canManage}>
              <div class="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                {language.t("projects.editDialog.permissionHint")}
              </div>
            </Show>

            <div
              class="mt-4 rounded-xl"
              style={{
                border: "1px solid rgba(220, 38, 38, 0.35)",
                "background-color": "rgba(254, 226, 226, 0.72)",
              }}
            >
              <div
                class="px-4 py-4"
                style={{
                  "border-bottom": "1px solid rgba(220, 38, 38, 0.28)",
                }}
              >
                <div class="text-14-medium" style={{ color: "rgb(185, 28, 28)" }}>
                  {language.t("projects.editDialog.danger.title")}
                </div>
                <div class="mt-1 text-12-regular" style={{ color: "rgba(185, 28, 28, 0.85)" }}>
                  {language.t("projects.editDialog.danger.description")}
                </div>
              </div>
              <div class="flex items-center justify-between gap-4 px-4 py-4">
                <div class="text-sm" style={{ color: "rgba(185, 28, 28, 0.85)" }}>
                  {language.t("projects.editDialog.danger.deleteHint")}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  loading={store.deleting}
                  disabled={!props.canManage || store.deleting}
                  style={{
                    border: "1px solid rgba(220, 38, 38, 0.35)",
                    backgroundColor: "rgba(254, 202, 202, 0.95)",
                    color: "rgb(185, 28, 28)",
                  }}
                  onClick={() => void handleDelete()}
                >
                  {language.t("projects.editDialog.danger.delete")}
                </Button>
              </div>
            </div>

            {store.error ? <div class="mt-4 text-sm text-red-500">{store.error}</div> : null}
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-border-weak-base px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
              {language.t("common.cancel")}
            </Button>
            <Button type="submit" loading={store.saving} disabled={!props.canManage || !store.name.trim() || store.saving}>
              {language.t("projects.editDialog.submit")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function toDateTimeLocalValue(iso: string) {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}
