import { describe, expect, test } from "bun:test"
import { workspaceKey } from "./workspace-key"

describe("workspace-key", () => {
  test("normalizes trailing slash in workspace key", () => {
    expect(workspaceKey("/tmp/demo///")).toBe("/tmp/demo")
    expect(workspaceKey("C:\\tmp\\demo\\\\")).toBe("C:\\tmp\\demo")
  })

  test("preserves posix and drive roots in workspace key", () => {
    expect(workspaceKey("/")).toBe("/")
    expect(workspaceKey("///")).toBe("/")
    expect(workspaceKey("C:\\")).toBe("C:\\")
    expect(workspaceKey("C:\\\\\\")).toBe("C:\\")
    expect(workspaceKey("C:///")).toBe("C:/")
  })
})
