export function relay<T>(input: {
  signal: AbortSignal
  active: () => boolean
  open: (handler: (event: T) => void) => () => void
  event: (event: T) => boolean
}) {
  if (input.signal.aborted || !input.active()) return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    let done = false
    let off = () => {}

    const close = (value: boolean) => {
      if (done) return
      done = true
      input.signal.removeEventListener("abort", abort)
      off()
      resolve(value)
    }
    const abort = () => close(false)

    off = input.open((event) => {
      if (input.signal.aborted || !input.active()) return
      if (input.event(event)) close(true)
    })
    if (done) {
      off()
      return
    }

    input.signal.addEventListener("abort", abort, { once: true })
    if (input.signal.aborted || !input.active()) close(false)
  })
}
