import { cn } from "@/lib/utils"
import { base } from "./styles-base"
import { card } from "./styles-card"
import { table } from "./styles-table"

export const sx = {
  ...base,
  ...card,
  ...table,
} as const

export const st = {
  arrow: (dir: "up" | "down", on: boolean) => cn(dir === "up" ? sx.sortUp : sx.sortDown, on && (dir === "up" ? sx.sortUpOn : sx.sortDownOn)),
  dot: (on: boolean) => cn(sx.dashDot, on && sx.dashPulse),
  filter: (on: boolean) => cn(sx.filterBtn, on && sx.filterBtnOn),
  page: (on: boolean) => cn(sx.page, on && sx.pageOn),
  sort: (on: boolean) => cn(sx.sort, on && sx.sortOn),
  tab: (on: boolean) => cn(sx.tab, on ? sx.tabOn : sx.tabOff),
} as const