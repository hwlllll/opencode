import { For } from "solid-js"

function WaveSkeleton(props: { class?: string }) {
  return (
    <div
      class={`relative overflow-hidden ${props.class || ""}`}
      style="background: color-mix(in srgb, var(--native-border) 12%, transparent)"
    >
      <div
        class="absolute inset-0"
        style="background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%); background-size: 200% 100%; animation: skeleton-wave 2s ease-in-out infinite;"
      />
    </div>
  )
}

export function PageLoadingSkeleton() {
  return (
    <>
      <style>{`
        @keyframes skeleton-wave {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div class="flex size-full">
        {/* 侧边栏骨架 */}
        <aside class="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] bg-[var(--native-panel)] py-4">
          <WaveSkeleton class="h-10 w-10 rounded-[var(--native-radius-md)]" />
          <WaveSkeleton class="h-10 w-10 rounded-[var(--native-radius-md)]" />
          <div class="mt-auto flex flex-col gap-2">
            <WaveSkeleton class="h-10 w-10 rounded-[var(--native-radius-md)]" />
            <WaveSkeleton class="h-10 w-10 rounded-[var(--native-radius-md)]" />
          </div>
        </aside>

        {/* 主内容骨架 */}
        <div class="ml-12 flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* 标题区 */}
          <div class="flex flex-col gap-3 px-[clamp(1rem,2vw,2rem)] pt-[clamp(1rem,1.5vw,1.5rem)]">
            <WaveSkeleton class="h-4 w-24 rounded" />
            <WaveSkeleton class="h-8 w-56 rounded-lg" />
          </div>

          {/* 内容区 */}
          <div class="flex flex-1 flex-col gap-4 overflow-hidden px-[clamp(1rem,2vw,2rem)] py-4">
            {/* 操作栏 */}
            <div class="flex flex-wrap items-center gap-3">
              <WaveSkeleton class="h-9 w-32 rounded-lg" />
              <WaveSkeleton class="h-9 w-24 rounded-lg" />
              <div class="flex-1" />
              <WaveSkeleton class="h-9 w-20 rounded-lg" />
            </div>

            <div class="flex flex-1 flex-col gap-4">
              {/* 大卡片 - 自适应宽度、不同高度 */}
              <div class="flex gap-4">
                <WaveSkeleton class="h-32 flex-1 rounded-xl" />
                <WaveSkeleton class="h-24 w-1/3 rounded-xl hidden sm:block" />
              </div>

              {/* 小卡片 - 自适应 */}
              <div class="flex gap-3">
                <WaveSkeleton class="h-20 flex-1 rounded-lg" />
                <WaveSkeleton class="h-20 flex-1 rounded-lg" />
                <WaveSkeleton class="h-20 flex-1 rounded-lg hidden md:block" />
              </div>

              {/* 列表项 - 不固定宽度 */}
              <div class="flex flex-1 flex-col gap-3">
                <For each={Array.from({ length: 4 })}>
                  {(_, i) => (
                    <div class="flex items-center gap-4 rounded-lg border border-[color:color-mix(in_srgb,var(--native-border)_10%,transparent)] p-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                      <WaveSkeleton class="h-10 w-10 rounded-md" />
                      <div class="flex flex-1 flex-col gap-2">
                        <WaveSkeleton class={`h-4 rounded ${i() === 0 ? "w-3/4" : i() === 1 ? "w-5/6" : i() === 2 ? "w-2/3" : "w-4/5"}`} />
                        <WaveSkeleton class={`h-3 rounded ${i() === 0 ? "w-1/2" : i() === 1 ? "w-3/5" : "w-2/5"}`} />
                      </div>
                      <WaveSkeleton class="h-8 w-20 rounded hidden sm:block" />
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
