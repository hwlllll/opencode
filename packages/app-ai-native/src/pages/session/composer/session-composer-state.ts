export type SessionComposerState = {
  blocked: () => boolean
  questionRequest: () => any
  permissionRequest: () => any
  permissionResponding: () => boolean
  decide: (response: "once" | "always" | "reject") => void
  todos: () => any[]
  dock: () => boolean
  closing: () => boolean
  opening: () => boolean
}
