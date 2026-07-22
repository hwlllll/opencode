import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { Show, createEffect, createSignal, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"
import { sx } from "@/pages/store/lib/styles"
import type { CommandStatusResponse, UpdateCheckResponse, UpdateDeviceRequest, Device } from "@/pages/workspace/types"
import { deviceManagementService } from "@/pages/console/lib/device-management-service"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import { DeviceEditDialog } from "./device-edit-dialog"
import { DeviceUpgradeDialog } from "./device-upgrade-dialog"

type UpgradeStatus = {
  commandId: string
  deviceId: string
}

type DeviceCardProps = {
  device: Device
  onUpgrade: (deviceId: string) => Promise<string | undefined>
  onDelete: (deviceId: string) => Promise<void>
  onUpdate: (payload: { deviceId: string; data: UpdateDeviceRequest }) => Promise<void> | void
  onUpgradeCompleted?: () => void
}

const statusProps = (status?: string) => {
  if (status === "online") return { c: "#22c55e", label: "Online" }
  if (status === "offline") return { c: "#9ca3af", label: "Offline" }
  return { c: "var(--native-muted)", label: "Unknown" }
}

const UPGRADE_POLL_MS = 2000
const UPGRADE_TIMEOUT_MS = 3 * 60 * 1000
const UPGRADE_SUPPRESS_MS = 5 * 60 * 1000

function loadUpgradeCmdId(deviceId: string): string | null {
  try {
    return localStorage.getItem(`upgrade_${deviceId}`)
  } catch {
    return null
  }
}

function saveUpgradeCmdId(deviceId: string, commandId: string) {
  try {
    localStorage.setItem(`upgrade_${deviceId}`, commandId)
  } catch {}
}

function clearUpgradeCmdId(deviceId: string) {
  try {
    localStorage.removeItem(`upgrade_${deviceId}`)
  } catch {}
}

function markUpgradeCompleted(deviceId: string, oldVersion: string) {
  try {
    localStorage.setItem(`upgrade_done_${deviceId}`, JSON.stringify({ ts: Date.now(), v: oldVersion }))
  } catch {}
}

function isRecentlyUpgraded(deviceId: string): boolean {
  try {
    const raw = localStorage.getItem(`upgrade_done_${deviceId}`)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (Date.now() - data.ts > UPGRADE_SUPPRESS_MS) {
      localStorage.removeItem(`upgrade_done_${deviceId}`)
      return false
    }
    return true
  } catch {
    return false
  }
}

export function clearUpgradeSuppressedIfVersionChanged(deviceId: string, currentVersion: string) {
  try {
    const raw = localStorage.getItem(`upgrade_done_${deviceId}`)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.v && data.v !== currentVersion) {
      localStorage.removeItem(`upgrade_done_${deviceId}`)
    }
  } catch {}
}

export function DeviceCard(props: DeviceCardProps) {
  const dialog = useDialog()
  const language = useLanguage()

  const [upgradeProgress, setUpgradeProgress] = createSignal<number>(0)
  const [upgradeDone, setUpgradeDone] = createSignal<"completed" | "failed" | null>(null)
  const [isUpgrading, setIsUpgrading] = createSignal(false)
  const [activeCommandId, setActiveCommandId] = createSignal<string | null>(null)

  const handleEdit = () => {
    dialog.show(() => (
      <DeviceEditDialog
        device={props.device}
        onSaved={(data) => props.onUpdate({ deviceId: props.device.deviceId, data })}
      />
    ))
  }

  const handleUpgrade = async () => {
    const d = props.device
    if (!d.canUpdate || !d.platform || !d.version || d.status !== "online") return
    let info: UpdateCheckResponse
    try {
      info = await deviceManagementService.checkUpdate(d.platform, d.version)
    } catch {
      info = { can_update: true, version: d.latestVersion ?? "", changelog: "", download_url: "", sha256: "", force: false, min_client_version: "", release_date: "", size: 0 }
    }
    dialog.show(() => (
      <DeviceUpgradeDialog
        deviceName={d.displayName}
        currentVersion={d.version}
        update={info}
        onConfirm={async () => {
          const cmdId = await props.onUpgrade(d.deviceId)
          if (cmdId) {
            startUpgradePolling(d.deviceId, cmdId)
          }
        }}
      />
    ))
  }

  const handleDelete = () => {
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("store.devices.deregister.dialog.title")}
        description={language.t("store.devices.deregister.dialog.description", { device: props.device.displayName })}
        confirm={language.t("store.devices.deregister.button")}
        onConfirm={() => props.onDelete(props.device.deviceId)}
      />
    ))
  }

  function startUpgradePolling(deviceId: string, commandId: string) {
    setIsUpgrading(true)
    setUpgradeProgress(5)
    setUpgradeDone(null)
    setActiveCommandId(commandId)
    saveUpgradeCmdId(deviceId, commandId)
  }

  createEffect(() => {
    const deviceId = props.device.deviceId
    const cmdId = activeCommandId()
    if (!cmdId || !isUpgrading()) return
    const commandId = cmdId
    const oldVersion = props.device.version

    const startTime = Date.now()
    let stopped = false
    let timerId: ReturnType<typeof setTimeout> | undefined

    function finish(outcome: "completed" | "failed" | "notfound", errMsg?: string) {
      if (stopped) return
      stopped = true
      if (outcome === "completed") {
        setUpgradeProgress(100)
        setUpgradeDone("completed")
        markUpgradeCompleted(deviceId, oldVersion)
        showToast({ variant: "success", icon: "circle-check", title: language.t("store.devices.upgrade.toast.sent.title") })
      } else {
        setUpgradeDone("failed")
        showToast({
          variant: "error",
          icon: "circle-x",
          title: language.t("store.devices.upgrade.toast.failed.title"),
          description: errMsg || language.t("store.devices.upgrade.toast.failed.description"),
        })
      }
      clearUpgradeCmdId(deviceId)
      const delay = outcome === "completed" ? 1500 : 2000
      setTimeout(() => {
        setIsUpgrading(false)
        setUpgradeDone(null)
        if (outcome === "completed") props.onUpgradeCompleted?.()
      }, delay)
    }

    async function poll() {
      if (stopped) return
      if (Date.now() - startTime > UPGRADE_TIMEOUT_MS) {
        stopped = true
        setIsUpgrading(false)
        setUpgradeDone(null)
        clearUpgradeCmdId(deviceId)
        return
      }

      try {
        const status = await deviceManagementService.getCommandStatus(deviceId, commandId)
        if (stopped) return
        if (status === null) {
          finish("notfound")
          return
        }
        if (status.progress && status.progress > 0) {
          setUpgradeProgress(status.progress)
        }
        if (status.status === "completed") {
          finish("completed")
          return
        }
        if (status.status === "failed") {
          finish("failed", status.error)
          return
        }
      } catch {
        if (!stopped && Date.now() - startTime > 30 * 1000) {
          setUpgradeProgress(Math.min(upgradeProgress() + 0.5, 95))
        }
      }

      if (!stopped) {
        timerId = setTimeout(poll, UPGRADE_POLL_MS)
      }
    }

    timerId = setTimeout(poll, UPGRADE_POLL_MS)

    onCleanup(() => {
      stopped = true
      if (timerId !== undefined) clearTimeout(timerId)
    })
  })

  createEffect(() => {
    const deviceId = props.device.deviceId
    if (isUpgrading()) return
    const saved = loadUpgradeCmdId(deviceId)
    if (saved) {
      setActiveCommandId(saved)
      setIsUpgrading(true)
      setUpgradeProgress(5)
      setUpgradeDone(null)
    }
  })

  const sp = () => statusProps(props.device.status)
  const labels = () => props.device.label?.split(",").map((l) => l.trim()).filter(Boolean) ?? []
  const hasUpgrade = () => props.device.canUpdate && props.device.status === "online" && !isUpgrading() && !isRecentlyUpgraded(props.device.deviceId)
  const upgrading = () => isUpgrading()

  const progressColor = () => {
    if (upgradeDone() === "failed") return "#ef4444"
    if (upgradeDone() === "completed") return "#22c55e"
    return "#ff9800"
  }

  return (
    <div
      class={cn(sx.dashCard, "relative overflow-hidden")}
      style={upgrading() ? { "border-color": "color-mix(in srgb, #ff9800 40%, transparent)" } : undefined}
    >
      <div class={sx.dashHead}>
        <span class={sx.dashName}>{props.device.displayName}</span>
        <span
          class={sx.pill}
          style={{
            background: upgrading()
              ? "color-mix(in srgb, #ff9800 12%, transparent)"
              : `color-mix(in srgb, ${sp().c} 12%, transparent)`,
            color: upgrading() ? "#ff9800" : sp().c,
          }}
        >
          {upgrading()
            ? language.t("store.devices.upgrade.status")
            : language.t(`store.devices.status.${props.device.status}`) || sp().label}
        </span>
      </div>

      <div class={sx.platform}>
        <Icon name="server" size="small" />
        {props.device.platform || language.t("store.devices.unknownPlatform")}
        {props.device.version ? ` · v${props.device.version}` : ""}
      </div>

      <div class={cn(sx.dashSlug, "mb-1")}>
        ID: {props.device.deviceId.slice(0, 8)}
      </div>

      <Show when={labels().length > 0}>
        <div class={sx.labels}>
          {labels().map((label) => (
            <span
              class={sx.pill}
              style={{
                background: "color-mix(in srgb, var(--native-primary) 8%, transparent)",
                color: "var(--native-primary)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </Show>

      <div class={cn(sx.dashFoot, "gap-1 [&>button]:cursor-pointer")}>
        <Show when={hasUpgrade()}>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:opacity-80"
            style={{ background: "#ff9800" }}
            aria-label={language.t("store.devices.upgrade.button")}
            title={language.t("store.devices.upgrade.available", { version: props.device.latestVersion ?? "" })}
            onClick={handleUpgrade}
          >
            <Icon name="cloud-upload" size="small" style={{ color: "white" }} />
          </button>
        </Show>
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer text-[var(--native-muted)] transition-colors hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-foreground)]"
          aria-label={language.t("common.edit")}
          title={language.t("common.edit")}
          onClick={handleEdit}
        >
          <Icon name="edit" size="small" />
        </button>
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer text-[var(--native-muted)] transition-colors"
          style={{ "background-color": "transparent" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.08)"
            e.currentTarget.querySelector("svg")?.style.setProperty("color", "#ef4444")
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = ""
            e.currentTarget.querySelector("svg")?.style.removeProperty("color")
          }}
          aria-label={language.t("store.devices.deregister.button")}
          title={language.t("store.devices.deregister.button")}
          onClick={handleDelete}
        >
          <Icon name="trash" size="small" />
        </button>
      </div>

      <Show when={upgrading()}>
        <div
          class="absolute bottom-0 left-0 h-[3px] rounded-b-[var(--native-radius-md)] transition-all duration-500 ease-out"
          style={{
            width: `${upgradeProgress()}%`,
            background: upgradeDone() === "failed"
              ? "#ef4444"
              : upgradeDone() === "completed"
                ? "linear-gradient(90deg, #22c55e, #16a34a)"
                : "linear-gradient(90deg, #ff9800, #f57c00)",
          }}
        />
      </Show>
    </div>
  )
}
