import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import Back from "../components/back"
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import {
  createListCollection,
  SelectContent,
  SelectControl,
  SelectIndicator,
  SelectItem,
  SelectItemText,
  SelectList,
  SelectPositioner,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RatioPill } from "../components/ratio-pill"
import { DateRangePicker } from "../components/filters/date-range-picker"
import { AddRepoToProjectDialog } from "../components/dialogs/add-repo-to-project-dialog"
import { getRepoDetail } from "../lib/api"
import { defaultWideRange, parseQueryRange, rangeQuery, searchQuery } from "../lib/date-range"
import { formatDuration, formatLocalTime, shortId } from "../lib/formatters"
import type { DateRangeValue, RepoTaskRow } from "../lib/types"

function formatDay(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function rangePages(page: number, totalPages: number) {
  const size = 5
  if (totalPages <= size) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(page - 2, totalPages - size + 1))
  return Array.from({ length: size }, (_, i) => start + i)
}

function taskEffRatio(row: RepoTaskRow) {
  const ancient = row.task_ancient_minutes_manual ?? row.task_ancient_minutes
  const real = row.task_real_minutes_manual ?? row.task_real_minutes
  if (!ancient || !real || ancient <= 0 || real <= 0) return 0
  return (ancient / real) * 100
}

function ReasonTip(props: { value?: string }) {
  return (
    <Show when={props.value?.trim()}>
      <Tooltip value={props.value} placement="top">
        <span class="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] text-[var(--native-muted)]">
          ?
        </span>
      </Tooltip>
    </Show>
  )
}

function MetricCard(props: {
  label: string
  value: string
  hint?: string
  accent?: string
  title?: string
  clip?: boolean
}) {
  return (
    <article
      class="min-w-0 rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4 shadow-[var(--native-shadow-sm)]"
      style={{ "--metric-accent": props.accent ?? "var(--native-primary)" }}
    >
      <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:color-mix(in_oklab,var(--metric-accent)_72%,var(--native-dim))]">
        {props.label}
      </p>
      <p
        class={
          props.clip
            ? "mt-2 truncate text-[1.4rem] leading-none font-semibold tracking-[-0.04em] text-[var(--native-foreground)]"
            : "mt-2 text-[1.4rem] leading-none font-semibold tracking-[-0.04em] text-[var(--native-foreground)]"
        }
        title={props.title}
      >
        {props.value}
      </p>
      <Show when={props.hint}>
        <p class="mt-2 line-clamp-2 text-[0.8125rem] text-[var(--native-muted)]" title={props.hint}>
          {props.hint}
        </p>
      </Show>
    </article>
  )
}

function PaginationBar(props: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const language = useLanguage()
  const from = () => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1)
  const to = () => Math.min(props.page * props.pageSize, props.total)
  const visiblePages = () => rangePages(props.page, props.totalPages)
  const sizes = () => PAGE_SIZE_OPTIONS

  return (
    <div class="flex flex-col gap-3 border-t border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div class="text-[0.8125rem] leading-[1.55] text-[var(--native-muted)]">
        {language.t("kanban.pagination.showing", { from: from(), to: to(), total: props.total })}
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <div class="flex items-center gap-2">
          <span class="text-[0.8125rem] text-[var(--native-muted)]">{language.t("kanban.pagination.perPage")}</span>
          <SelectRoot
            collection={createListCollection({ items: sizes().map((s) => ({ label: String(s), value: String(s) })) })}
            value={[String(props.pageSize)]}
            onValueChange={(detail) => {
              const v = Number(detail.value[0])
              if (!isNaN(v)) props.onPageSizeChange(v)
            }}
          >
            <SelectControl>
              <SelectTrigger class="h-8 min-w-[4.5rem] px-3 py-0 text-[0.8125rem] text-[var(--native-foreground)]">
                <SelectValueText />
                <SelectIndicator />
              </SelectTrigger>
            </SelectControl>
            <SelectPositioner>
              <SelectContent class="max-h-[min(20rem,calc(var(--available-height)-1rem))] overflow-y-auto">
                <SelectList>
                  <For each={sizes()}>
                    {(size) => (
                      <SelectItem item={{ label: String(size), value: String(size) }}>
                        <SelectItemText>{size}</SelectItemText>
                      </SelectItem>
                    )}
                  </For>
                </SelectList>
              </SelectContent>
            </SelectPositioner>
          </SelectRoot>
        </div>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-[var(--native-radius-full)] border border-transparent bg-transparent text-[var(--native-muted)] transition-[background-color,color,border-color] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]"
          disabled={props.page <= 1}
          onClick={() => props.onPageChange(props.page - 1)}
        >
          <Icon name="chevron-left" />
        </button>
        <For each={visiblePages()}>
          {(page) => (
            <button
              type="button"
              class={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-[var(--native-radius-full)] border border-transparent bg-transparent text-[var(--native-muted)] transition-[background-color,color,border-color] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]",
                page === props.page && "bg-[var(--native-primary-soft)] text-[var(--native-primary)]",
              )}
              onClick={() => props.onPageChange(page)}
            >
              {page}
            </button>
          )}
        </For>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-[var(--native-radius-full)] border border-transparent bg-transparent text-[var(--native-muted)] transition-[background-color,color,border-color] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]"
          disabled={props.page >= props.totalPages}
          onClick={() => props.onPageChange(props.page + 1)}
        >
          <Icon name="chevron-right" />
        </button>
      </div>
    </div>
  )
}

export default function KanbanRepoDetail() {
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const dialog = useDialog()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; back?: string }>()

  const repoAddr = createMemo(() => decodeURIComponent(params.repoAddr ?? "").trim())
  const repoBranch = createMemo(() => decodeURIComponent(params.repoBranch ?? "").trim())
  const repoKey = createMemo(() => `${repoAddr()}::${repoBranch()}`)
  const dateRange = createMemo(() => parseQueryRange(search.startDate, search.endDate))
  const listHref = createMemo(() => {
    const back = search.back?.trim()
    if (back) return decodeURIComponent(back)
    const q = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
    ])
    const txt = q.toString()
    return txt ? `/kanban/repo?${txt}` : "/kanban/repo"
  })

  const detailHref = (branch?: string) => {
    const next = rangeQuery(dateRange())
    const q = searchQuery([
      ["startDate", next.startDate],
      ["endDate", next.endDate],
    ])
    if (search.back?.trim()) q.set("back", search.back.trim())
    const txt = q.toString()
    return branch
      ? `/kanban/repo/${encodeURIComponent(repoAddr())}/${encodeURIComponent(branch)}?${txt}`
      : `/kanban/repo/${encodeURIComponent(repoAddr())}?${txt}`
  }

  const [detail, { refetch }] = createResource(
    () => ({
      repoAddr: repoAddr(),
      repoBranch: repoBranch(),
      start: dateRange()[0],
      end: dateRange()[1],
    }),
    async (input) => {
      if (!input.repoAddr) return null
      try {
        return await getRepoDetail({
          repoAddr: input.repoAddr,
          repoBranch: input.repoBranch,
          dateRange: [input.start, input.end],
        })
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("kanban.repo.loadFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    },
  )

  const [cachedDetail, setCachedDetail] = createSignal<{
    key: string
    data: NonNullable<Awaited<ReturnType<typeof getRepoDetail>>>
  } | null>(null)

  createEffect(() => {
    const data = detail()
    if (!data) return
    setCachedDetail({ key: repoKey(), data })
  })

  const view = createMemo(() => {
    const data = detail()
    if (data) return data
    const cached = cachedDetail()
    if (cached?.key === repoKey()) return cached.data
    return null
  })

  const commits = createMemo(() => view()?.commits ?? [])
  const tasks = createMemo(() => view()?.tasks ?? [])
  const branches = createMemo(() => view()?.branches ?? [])

  const [commitPage, setCommitPage] = createSignal(1)
  const [taskPage, setTaskPage] = createSignal(1)
  const [commitPageSize, setCommitPageSize] = createSignal(10)
  const [taskPageSize, setTaskPageSize] = createSignal(10)

  const commitTotalPages = createMemo(() => Math.max(1, Math.ceil(commits().length / commitPageSize())))
  const taskTotalPages = createMemo(() => Math.max(1, Math.ceil(tasks().length / taskPageSize())))

  const pagedCommits = createMemo(() => {
    const start = (commitPage() - 1) * commitPageSize()
    return commits().slice(start, start + commitPageSize())
  })
  const pagedTasks = createMemo(() => {
    const start = (taskPage() - 1) * taskPageSize()
    return tasks().slice(start, start + taskPageSize())
  })

  const branchItems = createMemo(() =>
    createListCollection({
      items: [
        { value: "", label: language.t("kanban.repo.allBranches") },
        ...branches().map((item) => ({ value: item, label: item })),
      ],
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
    }),
  )

  const efficiency = createMemo(() => view()?.efficiency ?? {})
  const efficiencyRatio = createMemo(() => efficiency().efficiency_ratio ?? null)

  const totalDiffLines = createMemo(() => commits().reduce((sum, item) => sum + (item.diff_lines ?? 0), 0))
  const totalTokens = createMemo(() =>
    tasks().reduce((sum, item) => sum + (item.upstream_tokens ?? 0) + (item.downstream_tokens ?? 0), 0),
  )
  const totalCost = createMemo(() => tasks().reduce((sum, item) => sum + (item.cost ?? 0), 0))
  const contributorCount = createMemo(() => {
    const names = new Set<string>()
    for (const item of commits()) {
      if (item.git_user_name?.trim()) names.add(item.git_user_name.trim())
    }
    for (const item of tasks()) {
      if (item.user_name?.trim()) names.add(item.user_name.trim())
    }
    return names.size
  })

  const activityRange = createMemo(() => {
    const points = commits()
      .map((item) => item.commit_time)
      .filter((item): item is string => !!item)
      .map((item) => new Date(item).getTime())
      .filter((item) => Number.isFinite(item))
    if (!points.length) return "-"
    return `${formatDay(new Date(Math.min(...points)).toISOString())} ~ ${formatDay(new Date(Math.max(...points)).toISOString())}`
  })

  const openAddDialog = () => {
    if (!repoAddr()) return
    dialog.show(() => (
      <AddRepoToProjectDialog
        repoAddr={repoAddr()}
        repoBranch={repoBranch()}
        commits={commits()}
        dateRange={dateRange()}
        onAdded={() => void refetch()}
      />
    ))
  }

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <header class="flex w-full flex-col gap-3">
        <Back href={listHref()} label={language.t("kanban.repo.backToList")} />
        <h1 class="font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">
          {language.t("kanban.repo.detailTitle")}
        </h1>

        <div class="flex min-w-0 flex-nowrap items-center justify-end gap-3 overflow-x-auto">
          <SelectRoot
            collection={branchItems()}
            value={[repoBranch()]}
            onValueChange={(details) => {
              const next = details.value[0]
              navigate(detailHref(next || undefined))
            }}
            positioning={{ fitViewport: true, sameWidth: true }}
          >
            <SelectControl>
              <SelectTrigger class="flex h-10 min-w-[12rem] shrink-0">
                <SelectValueText placeholder={language.t("kanban.repo.allBranches")} />
                <SelectIndicator />
              </SelectTrigger>
            </SelectControl>
            <SelectPositioner>
              <SelectContent class="max-h-[min(20rem,calc(var(--available-height)-1rem))] overflow-y-auto">
                <SelectList>
                  <For each={branchItems().items}>
                    {(item) => (
                      <SelectItem item={item}>
                        <SelectItemText>{item.label}</SelectItemText>
                      </SelectItem>
                    )}
                  </For>
                </SelectList>
              </SelectContent>
            </SelectPositioner>
          </SelectRoot>

          <DateRangePicker
            value={dateRange()}
            fullWidth={false}
            onChange={(value) => {
              const next = value ?? defaultWideRange()
              const q = searchQuery([
                ["startDate", rangeQuery(next).startDate],
                ["endDate", rangeQuery(next).endDate],
              ])
              if (search.back?.trim()) q.set("back", search.back.trim())
              setSearch(Object.fromEntries(q.entries()))
            }}
            placeholder={language.t("kanban.filter.selectDateRange")}
          />

          <Button size="sm" class="shrink-0" onClick={openAddDialog} disabled={!view()}>
            {language.t("kanban.repo.addToProject")}
          </Button>
        </div>
      </header>

      <div class="flex w-full flex-col gap-5">
        <Show
          when={!detail.loading || view()}
          fallback={
            <div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] px-4 py-10 text-sm text-[var(--native-muted)] shadow-[var(--native-shadow-sm)]">
              {language.t("kanban.repo.loadingDetail")}
            </div>
          }
        >
          <Show
            when={view()}
            fallback={
              <div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] px-4 py-10 text-sm text-[var(--native-muted)] shadow-[var(--native-shadow-sm)]">
                {language.t("kanban.repo.noDetail")}
              </div>
            }
          >
            {(item) => (
              <>
                <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
                  <div class="mb-4 text-[1rem] font-semibold text-[var(--native-foreground)]">
                    {language.t("kanban.repo.basicInfo")}
                  </div>
                  <div class="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <MetricCard
                      label={language.t("kanban.metric.repoUrl")}
                      value={item().repo_addr || "-"}
                      title={item().repo_addr || undefined}
                      clip
                    />
                    <MetricCard
                      label={language.t("kanban.metric.branch")}
                      value={repoBranch() || item().repo_branch || language.t("kanban.repo.allBranches")}
                      accent="var(--native-info, var(--native-primary))"
                    />
                    <MetricCard
                      label={language.t("kanban.metric.activeTime")}
                      value={activityRange()}
                      accent="var(--native-success)"
                    />
                    <MetricCard
                      label={language.t("kanban.metric.commitCount")}
                      value={String(item().summary.commit_count ?? commits().length)}
                      accent="var(--native-warning)"
                    />
                    <MetricCard
                      label={language.t("kanban.metric.taskCount")}
                      value={String(item().summary.task_count ?? tasks().length)}
                      accent="var(--native-primary)"
                    />
                    <MetricCard
                      label={language.t("kanban.metric.totalTokens")}
                      value={totalTokens().toLocaleString()}
                      accent="var(--native-success)"
                    />
                  </div>
                </section>

                <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
                  <div class="mb-4 text-[1rem] font-semibold text-[var(--native-foreground)]">
                    {language.t("kanban.repo.metricsTitle")}
                  </div>
                  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <MetricCard
                      label={language.t("kanban.metric.traditionalEst")}
                      value={formatDuration(efficiency().repo_ancient_minutes, language.t)}
                      accent="var(--native-warning)"
                    />
                    <MetricCard
                      label={language.t("kanban.metric.actualTime")}
                      value={formatDuration(efficiency().repo_real_minutes, language.t)}
                      accent="var(--native-primary)"
                    />
                    <MetricCard
                      label={language.t("kanban.metric.efficiencyRatio")}
                      value={efficiencyRatio() == null ? "-" : `${Math.round(efficiencyRatio()!)}%`}
                      accent={
                        efficiencyRatio() != null && efficiencyRatio()! >= 300
                          ? "var(--native-success)"
                          : "var(--native-primary)"
                      }
                    />
                    <MetricCard
                      label={language.t("kanban.metric.codeLines")}
                      value={`${totalDiffLines().toLocaleString()} ${language.t("kanban.repo.lines")}`}
                      accent="var(--native-info, var(--native-primary))"
                    />
                    <MetricCard
                      label={language.t("kanban.metric.costFromTasks")}
                      value={totalCost() > 0 ? `${totalCost().toFixed(2)} ${language.t("kanban.repo.yuan")}` : "-"}
                      accent="var(--native-warning)"
                    />
                    <MetricCard
                      label={language.t("kanban.metric.contributors")}
                      value={`${contributorCount()} ${language.t("kanban.repo.people")}`}
                      accent="var(--native-success)"
                    />
                  </div>

                  <div class="mt-4 grid gap-4 lg:grid-cols-2">
                    <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4 text-sm text-[var(--native-muted)]">
                      <div class="flex items-center text-[var(--native-foreground)]">
                        <span class="font-medium">{language.t("kanban.repo.traditionalEstReason")}</span>
                        <ReasonTip value={efficiency().repo_ancient_minutes_reason} />
                      </div>
                      <p class="mt-2 leading-6">{efficiency().repo_ancient_minutes_reason || "-"}</p>
                    </div>
                    <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4 text-sm text-[var(--native-muted)]">
                      <div class="flex items-center text-[var(--native-foreground)]">
                        <span class="font-medium">{language.t("kanban.repo.actualTimeReason")}</span>
                        <ReasonTip value={efficiency().repo_real_minutes_reason} />
                      </div>
                      <p class="mt-2 leading-6">{efficiency().repo_real_minutes_reason || "-"}</p>
                    </div>
                  </div>
                </section>

                <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
                  <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">
                    {language.t("kanban.section.commitList")} ({commits().length})
                  </div>
                  <div class="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead class="min-w-[100px]">{language.t("kanban.table.commitId")}</TableHead>
                          <TableHead class="min-w-[150px]">{language.t("kanban.table.time")}</TableHead>
                          <TableHead class="min-w-[90px]">{language.t("kanban.table.user")}</TableHead>
                          <TableHead class="min-w-[220px]">{language.t("kanban.table.description")}</TableHead>
                          <TableHead class="min-w-[90px] text-left">{language.t("kanban.metric.codeLines")}</TableHead>
                          <TableHead class="min-w-[100px] text-left">
                            {language.t("kanban.metric.actualTime")}
                          </TableHead>
                          <TableHead class="min-w-[140px] text-left">
                            {language.t("kanban.metric.traditionalEst")}
                          </TableHead>
                          <TableHead class="min-w-[90px] text-left">{language.t("kanban.table.silica")}</TableHead>
                          <TableHead class="min-w-[90px] text-left">
                            {language.t("kanban.metric.efficiencyRatio")}
                          </TableHead>
                          <TableHead class="min-w-[110px] text-left">
                            {language.t("kanban.table.tokensConsumed")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <For each={pagedCommits()}>
                          {(row) => (
                            <TableRow>
                              <TableCell>
                                {row.commit_id?.trim()
                                  ? (
                                    <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => {
                                      const id = row.commit_id!.trim()
                                      const q = searchQuery([
                                        ["startDate", search.startDate],
                                        ["endDate", search.endDate],
                                      ]).toString()
                                      navigate(`/kanban/commit/${encodeURIComponent(id)}${q ? `?${q}` : ""}`)
                                    }}>
                                      {shortId(row.commit_id)}
                                    </button>
                                    )
                                  : <span>-</span>}
                              </TableCell>
                              <TableCell>{formatLocalTime(row.commit_time)}</TableCell>
                              <TableCell>{row.git_user_name || "-"}</TableCell>
                              <TableCell>{row.comment || "-"}</TableCell>
                              <TableCell class="text-left tabular-nums">{row.diff_lines ?? "-"}</TableCell>
                              <TableCell class="text-left">
                                {formatDuration(row.commit_real_minutes_manual ?? row.commit_real_minutes, language.t)}
                              </TableCell>
                              <TableCell class="text-left">
                                {formatDuration(
                                  row.commit_ancient_minutes_manual ?? row.commit_ancient_minutes,
                                  language.t,
                                )}
                              </TableCell>
                              <TableCell class="text-left">
                                <RatioPill value={row.silica} digits={1} />
                              </TableCell>
                              <TableCell class="text-left">
                                <RatioPill value={row.efficiency_ratio} />
                              </TableCell>
                              <TableCell class="text-left tabular-nums">
                                {(row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0) > 0
                                  ? ((row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)).toLocaleString()
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          )}
                        </For>
                      </TableBody>
                    </Table>
                  </div>
                  <Show when={commits().length > commitPageSize()}>
                    <PaginationBar
                      page={commitPage()}
                      totalPages={commitTotalPages()}
                      total={commits().length}
                      pageSize={commitPageSize()}
                      onPageChange={setCommitPage}
                      onPageSizeChange={(size) => {
                        setCommitPageSize(size)
                        setCommitPage(1)
                      }}
                    />
                  </Show>
                </section>

                <Show when={tasks().length > 0}>
                  <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
                    <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">
                      {language.t("kanban.section.taskList")} ({tasks().length})
                    </div>
                    <div class="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead class="min-w-[100px]">{language.t("kanban.table.taskId")}</TableHead>
                            <TableHead class="min-w-[150px]">{language.t("kanban.table.time")}</TableHead>
                            <TableHead class="min-w-[90px]">{language.t("kanban.table.user")}</TableHead>
                            <TableHead class="min-w-[220px]">{language.t("kanban.table.description")}</TableHead>
                            <TableHead class="min-w-[90px] text-left">
                              {language.t("kanban.metric.codeLines")}
                            </TableHead>
                            <TableHead class="min-w-[100px] text-left">
                              {language.t("kanban.metric.actualTime")}
                            </TableHead>
                            <TableHead class="min-w-[140px] text-left">
                              {language.t("kanban.metric.traditionalEst")}
                            </TableHead>
                            <TableHead class="min-w-[90px] text-left">
                              {language.t("kanban.metric.efficiencyRatio")}
                            </TableHead>
                            <TableHead class="min-w-[80px] text-left">{language.t("kanban.table.cost")}</TableHead>
                            <TableHead class="min-w-[110px] text-left">
                              {language.t("kanban.table.tokensConsumed")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <For each={pagedTasks()}>
                            {(row) => (
                              <TableRow>
                                <TableCell>
                                  {row.task_id?.trim()
                                    ? (
                                      <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => {
                                        const id = row.task_id!.trim()
                                        navigate(`/kanban/task/${encodeURIComponent(id)}`)
                                      }}>
                                        {shortId(row.task_id)}
                                      </button>
                                      )
                                    : <span>-</span>}
                                </TableCell>
                                <TableCell>{formatLocalTime(row.start_time)}</TableCell>
                                <TableCell>{row.user_name || "-"}</TableCell>
                                <TableCell>{row.title || "-"}</TableCell>
                                <TableCell class="text-left tabular-nums">{row.diff_lines ?? "-"}</TableCell>
                                <TableCell class="text-left">
                                  {formatDuration(row.task_real_minutes_manual ?? row.task_real_minutes, language.t)}
                                </TableCell>
                                <TableCell class="text-left">
                                  {formatDuration(
                                    row.task_ancient_minutes_manual ?? row.task_ancient_minutes,
                                    language.t,
                                  )}
                                </TableCell>
                                <TableCell class="text-left">
                                  <RatioPill value={taskEffRatio(row)} />
                                </TableCell>
                                <TableCell class="text-left tabular-nums">
                                  {row.cost != null && row.cost > 0 ? row.cost.toFixed(2) : "-"}
                                </TableCell>
                                <TableCell class="text-left tabular-nums">
                                  {(row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0) > 0
                                    ? ((row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)).toLocaleString()
                                    : "-"}
                                </TableCell>
                              </TableRow>
                            )}
                          </For>
                        </TableBody>
                      </Table>
                    </div>
                    <Show when={tasks().length > taskPageSize()}>
                      <PaginationBar
                        page={taskPage()}
                        totalPages={taskTotalPages()}
                        total={tasks().length}
                        pageSize={taskPageSize()}
                        onPageChange={setTaskPage}
                        onPageSizeChange={(size) => {
                          setTaskPageSize(size)
                          setTaskPage(1)
                        }}
                      />
                    </Show>
                  </section>
                </Show>
              </>
            )}
          </Show>
        </Show>
      </div>
    </div>
  )
}
