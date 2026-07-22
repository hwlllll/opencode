import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { Show, createResource, Suspense, ErrorBoundary, Switch, Match } from "solid-js"
import { loadCoStrictCredentials, type CoStrictCredentials } from "@/costrict/provider/credentials"
import { createHash } from "node:crypto"
import open from "open"

interface QuotaInfo {
  total_quota?: number
  used_quota?: number
  is_star?: string
}

/**
 * Generate a simple unique ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Parse JWT token to extract user information
 */
function parseJwt(token: string): { universal_id?: string } {
  const parts = token.split(".")
  if (parts.length !== 3) {
    throw new Error("Invalid JWT")
  }
  const payload = parts[1]
  const decoded = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
  return JSON.parse(decoded)
}

/**
 * Hash token with SHA-256
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Fetch quota information from CoStrict API
 */
async function fetchQuotaInfo(baseUrl: string, accessToken: string): Promise<QuotaInfo | null> {
  const requestId = generateRequestId()
  try {
    const response = await fetch(`${baseUrl}/quota-manager/api/v1/quota`, {
      method: "GET",
      headers: {
        "X-Request-ID": requestId,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = (await response.json()) as { data?: QuotaInfo }
    return data?.data || null
  } catch {
    return null
  }
}

/**
 * Load credentials and fetch quota info
 */
async function loadCreditInfo(): Promise<{
  credentials: CoStrictCredentials
  quota: QuotaInfo
  userId: string
  managementUrl: string
} | null> {
  const credentials = await loadCoStrictCredentials()

  if (!credentials) {
    return null
  }

  const { access_token, base_url } = credentials

  if (!base_url || !access_token) {
    return null
  }

  const quota = await fetchQuotaInfo(base_url, access_token)

  if (!quota) {
    return null
  }

  // Parse JWT token to get user ID (universal_id)
  const parsedJwt = parseJwt(access_token)
  const userId = parsedJwt.universal_id || "Unknown"

  // Generate token hash as state parameter
  const state = hashToken(access_token)

  // Build management URL
  const managementUrl = `${base_url}/credit/manager?state=${state}&tab=usage`

  return {
    credentials,
    quota,
    userId,
    managementUrl,
  }
}

export type DialogCreditProps = {}

export function DialogCredit() {
  const { theme } = useTheme()
  const [creditInfo] = createResource(loadCreditInfo)

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Credit
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <ErrorBoundary
        fallback={(error) => (
          <text fg={theme.error}>Error: {error instanceof Error ? error.message : String(error)}</text>
        )}
      >
        <Suspense fallback={<text fg={theme.textMuted}>Loading credit information...</text>}>
          <Switch>
            <Match when={creditInfo() === null}>
              <box gap={1}>
                <text fg={theme.error}>CoStrict authentication credentials not found.</text>
                <text fg={theme.text}>Please log in to CoStrict.</text>
              </box>
            </Match>
            <Match when={creditInfo()}>
              {(info) => {
                const { total_quota, used_quota, is_star } = info().quota
                const remainingQuota =
                  total_quota !== undefined && used_quota !== undefined ? total_quota - used_quota : undefined
                const usagePercent =
                  total_quota && used_quota !== undefined ? ((used_quota / total_quota) * 100).toFixed(2) : undefined

                return (
                  <box gap={1}>
                    <box flexDirection="row" gap={1}>
                      <text fg={theme.textMuted}>User ID:</text>
                      <text fg={theme.text}>{info().userId}</text>
                    </box>

                    <Show when={is_star}>
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>Star User:</text>
                        <text fg={theme.success}>Yes</text>
                      </box>
                    </Show>

                    <box flexDirection="row" gap={1}>
                      <text fg={theme.textMuted}>Total Quota:</text>
                      <text fg={theme.text}>{total_quota !== undefined ? total_quota.toLocaleString() : "N/A"}</text>
                    </box>

                    <box flexDirection="row" gap={1}>
                      <text fg={theme.textMuted}>Used Quota:</text>
                      <text fg={theme.warning}>{used_quota !== undefined ? used_quota.toLocaleString() : "N/A"}</text>
                    </box>

                    <Show when={remainingQuota !== undefined}>
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>Remaining Quota:</text>
                        <text fg={theme.success}>{remainingQuota!.toLocaleString()}</text>
                      </box>
                    </Show>

                    <Show when={usagePercent !== undefined}>
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>Usage:</text>
                        <text fg={theme.text}>{usagePercent}%</text>
                      </box>
                    </Show>

                    <box gap={1}>
                      <text fg={theme.textMuted}>Management URL:</text>
                      <text
                        fg={theme.primary}
                        wrapMode="word"
                        onMouseUp={() => {
                          open(info().managementUrl).catch(() => {})
                        }}
                      >
                        {info().managementUrl}
                      </text>
                    </box>
                  </box>
                )
              }}
            </Match>
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </box>
  )
}
