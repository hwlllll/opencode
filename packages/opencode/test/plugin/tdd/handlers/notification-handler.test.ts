import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import {
  handleNotificationEvent,
  handleSessionCreated,
  cleanupSessionHistory,
  _test_getMainSessions,
  _test_clearMainSessions,
} from "../../../../src/plugin/tdd/handlers/notification-handler"
import { NotificationMode } from "../../../../src/permission/notification"

describe("Notification Handler - intervention.required event", () => {
  beforeEach(() => {
    _test_clearMainSessions()
  })

  describe("permission.asked event", () => {
    test("should not throw when handling permission.asked event", async () => {
      const event = {
        type: "permission.asked",
        properties: {
          id: "perm-123",
          sessionID: "session-1",
          permission: "write_file",
          patterns: ["*.ts"],
          always: true,
          tool: "bash",
          metadata: { path: "/test" },
        },
      }

      await handleNotificationEvent({ event })
    })

    test("should handle permission.asked event with minimal data", async () => {
      const event = {
        type: "permission.asked",
        properties: {
          id: "perm-456",
          sessionID: "session-2",
          permission: "read_file",
          patterns: [],
          always: false,
          tool: "read",
        },
      }

      await handleNotificationEvent({ event })
    })
  })

  describe("question.asked event", () => {
    test("should not throw when handling question.asked event", async () => {
      const event = {
        type: "question.asked",
        properties: {
          id: "req-789",
          sessionID: "session-3",
          questions: [{ question: "Continue?" }],
          tool: "bash",
        },
      }

      await handleNotificationEvent({ event })
    })

    test("should handle question.asked event with multiple questions", async () => {
      const event = {
        type: "question.asked",
        properties: {
          id: "req-multi",
          sessionID: "session-4",
          questions: [{ question: "Option A?" }, { question: "Option B?" }],
          tool: "question",
        },
      }

      await handleNotificationEvent({ event })
    })
  })

  describe("session.status idle event", () => {
    test("should not throw when handling idle event for main session", async () => {
      const mainSessionEvent = {
        type: "session.created",
        properties: {
          info: {
            id: "main-session",
            parentID: null,
          },
        },
      }

      await handleSessionCreated({ event: mainSessionEvent })

      const idleEvent = {
        type: "session.status",
        properties: {
          sessionID: "main-session",
          status: { type: "idle" },
        },
      }

      await handleNotificationEvent({ event: idleEvent })
    })

    test("should not throw when handling idle event for child session", async () => {
      const mainSessionEvent = {
        type: "session.created",
        properties: {
          info: {
            id: "main-session",
            parentID: null,
          },
        },
      }

      await handleSessionCreated({ event: mainSessionEvent })

      const idleEvent = {
        type: "session.status",
        properties: {
          sessionID: "child-session",
          status: { type: "idle" },
        },
      }

      await handleNotificationEvent({ event: idleEvent })
    })

    test("should not throw when handling non-idle status", async () => {
      const mainSessionEvent = {
        type: "session.created",
        properties: {
          info: {
            id: "main-session",
            parentID: null,
          },
        },
      }

      await handleSessionCreated({ event: mainSessionEvent })

      const activeEvent = {
        type: "session.status",
        properties: {
          sessionID: "main-session",
          status: { type: "active" },
        },
      }

      await handleNotificationEvent({ event: activeEvent })
    })

    test("should not throw when handling idle event for unknown session", async () => {
      const mainSessionEvent = {
        type: "session.created",
        properties: {
          info: {
            id: "main-session",
            parentID: null,
          },
        },
      }

      await handleSessionCreated({ event: mainSessionEvent })

      const idleEvent = {
        type: "session.status",
        properties: {
          sessionID: "unknown-session",
          status: { type: "idle" },
        },
      }

      await handleNotificationEvent({ event: idleEvent })
    })
  })

  describe("session created tracking", () => {
    test("should track main sessions without parentID", async () => {
      const event = {
        type: "session.created",
        properties: {
          info: {
            id: "session-without-parent",
            parentID: null,
          },
        },
      }

      await handleSessionCreated({ event })

      const mainSessions = _test_getMainSessions()
      expect(mainSessions.has("session-without-parent")).toBe(true)
    })

    test("should NOT track child sessions with parentID", async () => {
      const event = {
        type: "session.created",
        properties: {
          info: {
            id: "child-session",
            parentID: "main-session",
          },
        },
      }

      await handleSessionCreated({ event })

      const mainSessions = _test_getMainSessions()
      expect(mainSessions.has("child-session")).toBe(false)
    })

    test("should cleanup session history", async () => {
      const event = {
        type: "session.created",
        properties: {
          info: {
            id: "session-to-cleanup",
            parentID: null,
          },
        },
      }

      await handleSessionCreated({ event })

      expect(_test_getMainSessions().has("session-to-cleanup")).toBe(true)

      cleanupSessionHistory("session-to-cleanup")

      expect(_test_getMainSessions().has("session-to-cleanup")).toBe(false)
    })
  })

  describe("unknown event types", () => {
    test("should not throw when handling unknown event type", async () => {
      const unknownEvent = {
        type: "unknown.event",
        properties: {},
      }

      await handleNotificationEvent({ event: unknownEvent })
    })

    test("should not throw when handling event without matching conditions", async () => {
      const otherStatusEvent = {
        type: "session.status",
        properties: {
          sessionID: "session-1",
          status: { type: "error" },
        },
      }

      await handleNotificationEvent({ event: otherStatusEvent })
    })
  })

  describe("multiple sessions", () => {
    test("should track multiple main sessions", async () => {
      const sessions = [
        { id: "session-1", parentID: null },
        { id: "session-2", parentID: null },
        { id: "session-3", parentID: null },
      ]

      for (const session of sessions) {
        await handleSessionCreated({
          event: {
            type: "session.created",
            properties: {
              info: session,
            },
          },
        })
      }

      const mainSessions = _test_getMainSessions()
      expect(mainSessions.size).toBe(3)
      expect(mainSessions.has("session-1")).toBe(true)
      expect(mainSessions.has("session-2")).toBe(true)
      expect(mainSessions.has("session-3")).toBe(true)
    })

    test("should handle multiple notification events in sequence", async () => {
      const events = [
        {
          type: "permission.asked",
          properties: {
            id: "perm-1",
            sessionID: "session-1",
            permission: "read_file",
            patterns: [],
            always: false,
            tool: "read",
          },
        },
        {
          type: "question.asked",
          properties: {
            id: "q-1",
            sessionID: "session-1",
            questions: [{ question: "Yes?" }],
            tool: "question",
          },
        },
        {
          type: "permission.asked",
          properties: {
            id: "perm-2",
            sessionID: "session-1",
            permission: "write_file",
            patterns: ["*.ts"],
            always: true,
            tool: "bash",
          },
        },
      ]

      for (const event of events) {
        await handleNotificationEvent({ event })
      }
    })
  })

  describe("event data integrity", () => {
    test("should handle session.created event with all properties", async () => {
      const event = {
        type: "session.created",
        properties: {
          info: {
            id: "test-session",
            parentID: null,
          },
        },
      }

      await handleSessionCreated({ event })
      expect(_test_getMainSessions().has("test-session")).toBe(true)
    })

    test("should handle permission.asked event with all properties", async () => {
      const event = {
        type: "permission.asked",
        properties: {
          id: "perm-full",
          sessionID: "session-full",
          permission: "execute",
          patterns: ["*.js", "*.ts"],
          always: false,
          tool: "bash",
          metadata: { key: "value" },
        },
      }

      await handleNotificationEvent({ event })
    })

    test("should handle question.asked event with all properties", async () => {
      const event = {
        type: "question.asked",
        properties: {
          id: "q-full",
          sessionID: "session-full",
          questions: [{ question: "Q1?" }, { question: "Q2?" }, { question: "Q3?" }],
          tool: "custom-tool",
        },
      }

      await handleNotificationEvent({ event })
    })
  })
})
