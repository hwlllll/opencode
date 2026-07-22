import { createMemo, For } from "solid-js"
import { useTheme } from "@tui/context/theme"

type TipPart = { text: string; highlight: boolean }

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

export function SessionNavTips() {
  const theme = useTheme().theme
  const tipParts = createMemo(() => TIPS.map(parse))

  return (
    <box flexDirection="column" maxWidth="100%" gap={0}>
      <text flexShrink={0} style={{ fg: theme.warning }}>
        Session Tips:
      </text>
      <box flexDirection="column" gap={1}>
        <For each={tipParts()}>
          {(parts) => (
            <box flexDirection="row" maxWidth="100%">
              <text flexShrink={0} style={{ fg: theme.warning }}>
                ●{" "}
              </text>
              <text flexShrink={1}>
                <For each={parts}>
                  {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
                </For>
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

const TIPS = [
  "Press {highlight}Ctrl+X N{/highlight} or {highlight}/new{/highlight} to start a fresh conversation session",
  "Press {highlight}Ctrl+X L{/highlight} or {highlight}/sessions{/highlight} to list and continue previous conversations",
  "Press {highlight}Ctrl+X Q{/highlight} or {highlight}/exit{/highlight} to quit the application",
]
