import type { ParentProps } from "solid-js"

export default function DashboardLayout(props: ParentProps) {
  return (
    <div class="mx-auto flex max-w-[1100px] flex-col gap-6 px-7 pt-6 pb-12">
      {props.children}
    </div>
  )
}
