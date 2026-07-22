import { attachSpring, motionValue } from "motion"
import type { SpringOptions } from "motion"
import { createEffect, createSignal, onCleanup, untrack } from "solid-js"

type Opt = Partial<Pick<SpringOptions, "visualDuration" | "bounce" | "stiffness" | "damping" | "mass" | "velocity">>
const eq = (a: Opt | undefined, b: Opt | undefined) =>
  a?.visualDuration === b?.visualDuration &&
  a?.bounce === b?.bounce &&
  a?.stiffness === b?.stiffness &&
  a?.damping === b?.damping &&
  a?.mass === b?.mass &&
  a?.velocity === b?.velocity

const THRESHOLD = 0.01

export function useSpring(target: () => number, options?: Opt | (() => Opt), paused?: () => boolean) {
  const read = () => (typeof options === "function" ? options() : options)
  const [value, setValue] = createSignal(target())
  const source = motionValue(value())
  const spring = motionValue(value())
  let config = read()
  let frozen = false
  let settled = false
  let stop = attachSpring(spring, source, config)
  let off = spring.on("change", (next: number) => {
    const t = untrack(target)
    if (Math.abs(next - t) < THRESHOLD) {
      setValue(t)
      settled = true
      detach()
      return
    }
    setValue(next)
  })

  const detach = () => {
    if (frozen) return
    frozen = true
    off()
    stop()
  }

  const reattach = () => {
    if (!frozen) return
    frozen = false
    settled = false
    source.set(spring.get())
    stop = attachSpring(spring, source, config)
    off = spring.on("change", (next: number) => {
      const t = untrack(target)
      if (Math.abs(next - t) < THRESHOLD) {
        setValue(t)
        settled = true
        detach()
        return
      }
      setValue(next)
    })
  }

  createEffect(() => {
    if (paused?.()) {
      detach()
      const t = target()
      spring.set(t)
      source.set(t)
      setValue(t)
      return
    }
    const t = target()
    if (frozen && settled && Math.abs(spring.get() - t) < THRESHOLD) return
    if (frozen && settled) {
      spring.set(t)
      source.set(t)
      setValue(t)
      return
    }
    reattach()
    source.set(t)
  })

  createEffect(() => {
    if (!options) return
    const next = read()
    if (eq(config, next)) return
    config = next
    if (frozen) return
    stop()
    stop = attachSpring(spring, source, next)
    setValue(spring.get())
  })

  onCleanup(() => {
    off()
    stop()
    spring.destroy()
    source.destroy()
  })

  return value
}
