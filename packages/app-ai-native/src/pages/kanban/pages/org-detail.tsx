import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import type { EChartsOption } from "echarts"
import { Button } from "@/components/ui/button"
import { createListCollection, SelectContent, SelectControl, SelectIndicator, SelectItem, SelectItemText, SelectList, SelectPositioner, SelectRoot, SelectTrigger, SelectValueText } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Back from "../components/back"
import { ChartCard } from "../components/charts/chart-card"
import { FilterBar } from "../components/filters/filter-bar"
import { MetricCard } from "../components/metric-card"
import { RatioPill } from "../components/ratio-pill"
import { chart } from "../lib/chart-options"
import { defaultWideRange, parseQueryRange, rangeQuery, searchQuery } from "../lib/date-range"
import { formatDuration, formatPercent } from "../lib/formatters"
import { getOrgDetail } from "../lib/api"
import type { Granularity, OrgCascadeValue, UserDetailPeriodRow } from "../lib/types"

function parseGranularity(value?: string): Granularity {
  if (value === "week" || value === "month" || value === "year") return value
  return "day"
}

function parsePath(path: string) {
  const txt = decodeURIComponent(path).trim()
  if (!txt || txt === "all") return {} as OrgCascadeValue
  const parts = txt.split("/").filter(Boolean)
  return {
    org1: parts[0],
    org2: parts[1],
    org3: parts[2],
    org4: parts[3],
  } satisfies OrgCascadeValue
}

function orgPath(value: OrgCascadeValue) {
  const parts = [value.org1, value.org2, value.org3, value.org4].filter(Boolean)
  return parts.length ? parts.join("/") : "all"
}

function parentOrg(value: OrgCascadeValue) {
  if (value.org4) return { org1: value.org1, org2: value.org2, org3: value.org3 } satisfies OrgCascadeValue
  if (value.org3) return { org1: value.org1, org2: value.org2 } satisfies OrgCascadeValue
  if (value.org2) return { org1: value.org1 } satisfies OrgCascadeValue
  return {} as OrgCascadeValue
}

function fmtCost(value?: number | null) {
  if (value == null || value === 0) return "-"
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtTokens(up?: number, down?: number) {
  const total = (up ?? 0) + (down ?? 0)
  if (!total) return "-"
  if (total >= 1000000) return `${(total / 1000000).toFixed(1)}M`
  if (total >= 1000) return `${(total / 1000).toFixed(1)}K`
  return String(total)
}

function periodRange(row: UserDetailPeriodRow, granularity: Granularity) {
  const key = row.period_key?.trim() || row.period_label?.trim() || ""
  if (!key) return { start: "", end: "" }
  if (granularity === "day") return { start: key.replace(/-/g, ""), end: key.replace(/-/g, "") }
  if (granularity === "week") {
    const match = key.match(/^(\d{4})-W(\d{2})$/)
    if (!match) return { start: "", end: "" }
    const year = Number(match[1])
    const week = Number(match[2])
    const jan4 = new Date(year, 0, 4)
    const day = jan4.getDay() || 7
    const monday = new Date(jan4)
    monday.setDate(jan4.getDate() - day + 1 + (week - 1) * 7)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const start = `${monday.getFullYear()}${String(monday.getMonth() + 1).padStart(2, "0")}${String(monday.getDate()).padStart(2, "0")}`
    const end = `${sunday.getFullYear()}${String(sunday.getMonth() + 1).padStart(2, "0")}${String(sunday.getDate()).padStart(2, "0")}`
    return { start, end }
  }
  if (granularity === "month") {
    const [year, month] = key.split("-").map(Number)
    const last = new Date(year, month, 0).getDate()
    return {
      start: `${year}${String(month).padStart(2, "0")}01`,
      end: `${year}${String(month).padStart(2, "0")}${String(last).padStart(2, "0")}`,
    }
  }

  return { start: `${key}0101`, end: `${key}1231` }
}

function queryOf(range: [string, string], granularity: Granularity, org?: OrgCascadeValue) {
  const next = rangeQuery(range)
  return searchQuery([
    ["startDate", next.startDate],
    ["endDate", next.endDate],
    ["granularity", granularity],
    ["org1", org?.org1],
    ["org2", org?.org2],
    ["org3", org?.org3],
    ["org4", org?.org4],
  ])
}

export default function KanbanOrgDetail() {
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; granularity?: string; back?: string }>()

  const org = createMemo(() => parsePath(params.orgPath ?? ""))
  const orgKey = createMemo(() => orgPath(org()))
  const dateRange = createMemo(() => parseQueryRange(search.startDate, search.endDate))
  const granularity = createMemo(() => parseGranularity(search.granularity))
  const listHref = createMemo(() => {
    const back = search.back?.trim()
    if (back) return decodeURIComponent(back)
    const scope = parentOrg(org())
    const q = queryOf(dateRange(), granularity(), scope)
    return `/kanban/org?${q.toString()}`
  })

  const granularityItems = createMemo(() =>
    createListCollection({
      items: [
        { value: "day" as const, label: language.t("kanban.granularity.day") },
        { value: "week" as const, label: language.t("kanban.granularity.week") },
        { value: "month" as const, label: language.t("kanban.granularity.month") },
        { value: "year" as const, label: language.t("kanban.granularity.year") },
      ],
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
    }),
  )

  const [data, { refetch }] = createResource(
    () => ({ org: org(), dateRange: dateRange(), granularity: granularity() }),
    async (input) => {
      try {
        return await getOrgDetail(input)
      } catch (err) {
        showToast({ variant: "error", title: language.t("kanban.toast.loadFailed"), description: err instanceof Error ? err.message : String(err) })
        return null
      }
    },
  )

  const [cachedDetail, setCachedDetail] = createSignal<{ key: string; data: NonNullable<Awaited<ReturnType<typeof getOrgDetail>>> } | null>(null)

  createEffect(() => {
    const detail = data()
    if (!detail) return
    setCachedDetail({ key: orgKey(), data: detail })
  })

  const view = createMemo(() => {
    const detail = data()
    if (detail) return detail
    const cached = cachedDetail()
    if (cached?.key === orgKey()) return cached.data
    return null
  })

  const summary = createMemo(() => view()?.summary ?? {})
  const members = createMemo(() => view()?.members ?? [])
  const commits = createMemo(() => view()?.commits ?? [])
  const tasks = createMemo(() => view()?.tasks ?? [])

  const dailyEfficiency = createMemo<UserDetailPeriodRow[]>(() => {
    const taskRows = tasks()
    const commitRows = commits()
    const map = new Map<string, UserDetailPeriodRow>()
    for (const row of taskRows) {
      const key = row.period_key ?? row.period_label ?? ""
      map.set(key, { ...row })
    }
    for (const row of commitRows) {
      const key = row.period_key ?? row.period_label ?? ""
      const existing = map.get(key)
      if (existing) {
        map.set(key, {
          ...existing,
          commit_count: row.commit_count,
          commit_diff_lines: row.commit_diff_lines,
          commit_real_minutes: row.commit_real_minutes,
          commit_ancient_minutes: row.commit_ancient_minutes,
          commit_efficiency_ratio: row.commit_efficiency_ratio,
          upstream_tokens: (existing.upstream_tokens ?? 0) + (row.upstream_tokens ?? 0),
          downstream_tokens: (existing.downstream_tokens ?? 0) + (row.downstream_tokens ?? 0),
          cost: (existing.cost ?? 0) + (row.cost ?? 0),
        })
      } else {
        map.set(key, { ...row, task_count: 0, task_diff_lines: 0, task_real_minutes: null, task_ancient_minutes: null, task_efficiency_ratio: null })
      }
    }
    return Array.from(map.values())
  })
  const taskRatio = createMemo(() => summary().task_efficiency_ratio)
  const commitRatio = createMemo(() => summary().commit_efficiency_ratio)
  const periods = createMemo(() => {
    const source = tasks().length ? tasks() : commits()
    return source.map((item) => item.period_label || item.period_key || "-")
  })
  const taskValues = <T extends keyof (typeof tasks extends () => infer U ? U extends Array<infer R> ? R : never : never)>(field: T) => tasks().map((item) => Number(item[field] ?? 0))
  const commitValues = <T extends keyof (typeof commits extends () => infer U ? U extends Array<infer R> ? R : never : never)>(field: T) => commits().map((item) => Number(item[field] ?? 0))
  const countOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(`${language.t("kanban.table.taskCount")} / ${language.t("kanban.table.commitCount")}`, periods(), [{ name: "Task", data: taskValues("task_count") }, { name: "Commit", data: commitValues("commit_count") }], { type: "line" }) : undefined)
  const codeOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.metric.codeLines"), periods(), [{ name: "Task", data: taskValues("task_diff_lines") }, { name: "Commit", data: commitValues("commit_diff_lines") }], { type: "line" }) : undefined)
  const timeOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.table.actualTime"), periods(), [{ name: "Task", data: taskValues("task_real_minutes") }, { name: "Commit", data: commitValues("commit_real_minutes") }], { type: "line", format: (value) => formatDuration(value, language.t) }) : undefined)
  const ratioOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.chart.efficiencyRatio"), periods(), [{ name: "Task", data: taskValues("task_efficiency_ratio") }, { name: "Commit", data: commitValues("commit_efficiency_ratio") }], { type: "line", format: (value) => formatPercent(value) }) : undefined)
  const tokenOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.table.tokensConsumed"), periods(), [{ name: "Tokens", data: tasks().map((item) => (item.upstream_tokens ?? 0) + (item.downstream_tokens ?? 0)) }], { type: "line", format: (value) => value.toLocaleString() }) : undefined)
  const costOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.table.cost"), periods(), [{ name: "Cost", data: tasks().map((item) => Number(item.cost ?? 0)) }], { type: "line", format: (value) => fmtCost(value) }) : undefined)

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-5 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-3">
          <Back href={listHref()} />
          <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.detail.org")}</h1>
        </header>

        <FilterBar
          dateRange={dateRange()}
          orgValue={org()}
          dateSlot="actions"
          dateLabel={false}
          showOrg
          onDateRangeChange={(value) => {
            const next = value ?? defaultWideRange()
            setSearch(Object.fromEntries(queryOf(next, granularity(), org()).entries()))
          }}
          onOrgChange={(value) => {
            navigate(`/kanban/org/${encodeURIComponent(orgPath(value))}?${queryOf(dateRange(), granularity(), value).toString()}`)
          }}
          actions={
            <>
              <label class="flex min-w-0 flex-col gap-2">
                <SelectRoot
                  collection={granularityItems()}
                  value={[granularity()]}
                  onValueChange={(details) => {
                    const val = details.value[0]
                    if (val) {
                      setSearch(Object.fromEntries(queryOf(dateRange(), val as Granularity, org()).entries()))
                    }
                  }}
                  positioning={{ fitViewport: true, sameWidth: true }}
                >
                  <SelectControl>
                    <SelectTrigger class="h-10 w-[6rem] min-w-[6rem] flex-none">
                      <SelectValueText />
                      <SelectIndicator />
                    </SelectTrigger>
                  </SelectControl>
                  <SelectPositioner>
                    <SelectContent class="max-h-[min(20rem,calc(var(--available-height)-1rem))] overflow-y-auto">
                      <SelectList>
                        <SelectItem item={granularityItems().items[0]}>
                          <SelectItemText>{language.t("kanban.granularity.day")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[1]}>
                          <SelectItemText>{language.t("kanban.granularity.week")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[2]}>
                          <SelectItemText>{language.t("kanban.granularity.month")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[3]}>
                          <SelectItemText>{language.t("kanban.granularity.year")}</SelectItemText>
                        </SelectItem>
                      </SelectList>
                    </SelectContent>
                  </SelectPositioner>
                </SelectRoot>
              </label>
              <div class="flex items-end">
                <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={data.loading}>{data.loading ? language.t("kanban.action.refreshing") : language.t("kanban.action.refresh")}</Button>
              </div>
            </>
          }
        />

        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard label={language.t("kanban.metric.memberCount")} value={String(summary().user_count ?? 0)} accent="var(--native-success)" />
          <MetricCard label={language.t("kanban.metric.taskCodeAmount")} value={String(summary().task_diff_lines ?? 0)} accent="var(--native-warning)" />
          <MetricCard label={language.t("kanban.metric.commitCodeAmount")} value={String(summary().commit_diff_lines ?? 0)} accent="var(--native-primary)" />
          <MetricCard label={language.t("kanban.metric.taskEfficiency")} value={formatPercent(taskRatio())} accent="var(--native-success)" />
          <MetricCard label={language.t("kanban.metric.commitEfficiency")} value={formatPercent(commitRatio())} accent="var(--native-primary)" />
          <MetricCard label={language.t("kanban.metric.totalCost")} value={fmtCost(summary().cost)} accent="var(--native-warning)" />
        </section>

        <section class="overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
          <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.userList")}</div>
          <div class="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="min-w-[140px]">{language.t("kanban.table.userName")}</TableHead>
                  <TableHead class="min-w-[120px] text-left">{language.t("kanban.table.commitCodeLines")}</TableHead>
                  <TableHead class="min-w-[130px] text-left">{language.t("kanban.table.commitActualTime")}</TableHead>
                  <TableHead class="min-w-[150px] text-left">{language.t("kanban.table.commitTraditionalEst")}</TableHead>
                  <TableHead class="min-w-[120px] text-left">{language.t("kanban.table.commitEfficiency")}</TableHead>
                  <TableHead class="min-w-[110px] text-left">{language.t("kanban.table.taskCodeLines")}</TableHead>
                  <TableHead class="min-w-[120px] text-left">{language.t("kanban.table.taskActualTime")}</TableHead>
                  <TableHead class="min-w-[150px] text-left">{language.t("kanban.table.taskTraditionalEst")}</TableHead>
                  <TableHead class="min-w-[110px] text-left">{language.t("kanban.table.taskEfficiency")}</TableHead>
                  <TableHead class="min-w-[120px] text-left">{language.t("kanban.table.tokensConsumed")}</TableHead>
                  <TableHead class="min-w-[100px] text-left">{language.t("kanban.table.cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={members()}>
                  {(row) => (
                    <TableRow>
                      <TableCell>
                        <button
                          type="button"
                          class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer"
                          onClick={() => {
                            const txt = row.user_id?.trim()
                            if (!txt) return
                            navigate(`/kanban/user/${encodeURIComponent(txt)}?${queryOf(dateRange(), granularity(), org()).toString()}`)
                          }}
                        >
                          {row.user_name || row.user_id || "-"}
                        </button>
                      </TableCell>
                      <TableCell class="text-left tabular-nums">{row.commit_diff_lines ?? 0}</TableCell>
                      <TableCell class="text-left">{formatDuration(row.commit_real_minutes, language.t)}</TableCell>
                      <TableCell class="text-left">{formatDuration(row.commit_ancient_minutes, language.t)}</TableCell>
                      <TableCell class="text-left"><RatioPill value={row.commit_efficiency_ratio} /></TableCell>
                      <TableCell class="text-left tabular-nums">{row.task_diff_lines ?? 0}</TableCell>
                      <TableCell class="text-left">{formatDuration(row.task_real_minutes, language.t)}</TableCell>
                      <TableCell class="text-left">{formatDuration(row.task_ancient_minutes, language.t)}</TableCell>
                      <TableCell class="text-left"><RatioPill value={row.task_efficiency_ratio} /></TableCell>
                      <TableCell class="text-left tabular-nums">{fmtTokens(row.upstream_tokens, row.downstream_tokens)}</TableCell>
                      <TableCell class="text-left tabular-nums">{fmtCost(row.cost)}</TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>
        </section>

        <section class="overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
          <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.dailyEfficiency")}</div>
          <div class="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="min-w-[140px]">{language.t("kanban.table.time")}</TableHead>
                  <TableHead class="min-w-[80px] text-left">{language.t("kanban.table.taskCount")}</TableHead>
                  <TableHead class="min-w-[90px] text-left">{language.t("kanban.table.commitCount")}</TableHead>
                  <TableHead class="min-w-[90px] text-left">{language.t("kanban.table.taskCodeLines")}</TableHead>
                  <TableHead class="min-w-[100px] text-left">{language.t("kanban.table.commitCodeLines")}</TableHead>
                  <TableHead class="min-w-[110px] text-left">{language.t("kanban.table.taskActualTime")}</TableHead>
                  <TableHead class="min-w-[120px] text-left">{language.t("kanban.table.commitActualTime")}</TableHead>
                  <TableHead class="min-w-[150px] text-left">{language.t("kanban.table.taskTraditionalEst")}</TableHead>
                  <TableHead class="min-w-[150px] text-left">{language.t("kanban.table.commitTraditionalEst")}</TableHead>
                  <TableHead class="min-w-[100px] text-left">{language.t("kanban.table.taskEfficiency")}</TableHead>
                  <TableHead class="min-w-[110px] text-left">{language.t("kanban.table.commitEfficiency")}</TableHead>
                  <TableHead class="min-w-[120px] text-left">{language.t("kanban.table.tokensConsumed")}</TableHead>
                  <TableHead class="min-w-[100px] text-left">{language.t("kanban.table.cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={dailyEfficiency()}>
                  {(row) => {
                    const linkQuery = () => {
                      const span = periodRange(row, granularity())
                      const q = new URLSearchParams()
                      if (span.start && span.end) {
                        q.set("startDate", span.start)
                        q.set("endDate", span.end)
                      }
                      const o = org()
                      if (o.org1) q.set("org1", o.org1)
                      if (o.org2) q.set("org2", o.org2)
                      if (o.org3) q.set("org3", o.org3)
                      if (o.org4) q.set("org4", o.org4)
                      return q.toString()
                    }
                    const taskLink = () => `/kanban/task?${linkQuery()}`
                    const commitLink = () => `/kanban/commit?${linkQuery()}`

                    return (
                      <TableRow>
                        <TableCell>{row.period_label || row.period_key || "-"}</TableCell>
                        <TableCell class="text-left tabular-nums">{(row.task_count ?? 0) > 0 ? <button type="button" class="text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => navigate(taskLink())}>{row.task_count}</button> : 0}</TableCell>
                        <TableCell class="text-left tabular-nums">{(row.commit_count ?? 0) > 0 ? <button type="button" class="text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => navigate(commitLink())}>{row.commit_count}</button> : 0}</TableCell>
                        <TableCell class="text-left tabular-nums">{row.task_diff_lines ?? 0}</TableCell>
                        <TableCell class="text-left tabular-nums">{row.commit_diff_lines ?? 0}</TableCell>
                        <TableCell class="text-left">{formatDuration(row.task_real_minutes, language.t)}</TableCell>
                        <TableCell class="text-left">{formatDuration(row.commit_real_minutes, language.t)}</TableCell>
                        <TableCell class="text-left">{formatDuration(row.task_ancient_minutes, language.t)}</TableCell>
                        <TableCell class="text-left">{formatDuration(row.commit_ancient_minutes, language.t)}</TableCell>
                        <TableCell class="text-left"><RatioPill value={row.task_efficiency_ratio} /></TableCell>
                        <TableCell class="text-left"><RatioPill value={row.commit_efficiency_ratio} /></TableCell>
                        <TableCell class="text-left tabular-nums">{fmtTokens(row.upstream_tokens, row.downstream_tokens)}</TableCell>
                        <TableCell class="text-left tabular-nums">{fmtCost(row.cost)}</TableCell>
                      </TableRow>
                    )
                  }}
                </For>
              </TableBody>
            </Table>
          </div>
        </section>

        <section class="grid gap-4 xl:grid-cols-2">
          <ChartCard option={countOption()} empty={language.t("kanban.chart.empty.count")} />
          <ChartCard option={codeOption()} empty={language.t("kanban.chart.empty.code")} />
          <ChartCard option={timeOption()} empty={language.t("kanban.chart.empty.time")} />
          <ChartCard option={ratioOption()} empty={language.t("kanban.chart.empty.ratio")} />
          <ChartCard option={tokenOption()} empty={language.t("kanban.chart.empty.token")} />
          <ChartCard option={costOption()} empty={language.t("kanban.chart.empty.cost")} />
        </section>
      </div>
    </div>
  )
}
