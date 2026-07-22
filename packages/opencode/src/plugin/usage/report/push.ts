import { loadCoStrictCredentials, saveCoStrictCredentials } from "@/costrict/provider/credentials"
import { isCoStrictTokenValid, refreshCoStrictToken, extractExpiryFromJWT } from "@/costrict/provider/token"
import { getCloudApiUrl, getCloudBaseUrl, loadDevice } from "@/costrict/device/client"
import { Installation } from "@/installation"
import { v7 as uuidv7 } from "uuid"
import type { Report } from "../queue/jsonl"

async function auth() {
  let creds = await loadCoStrictCredentials()
  if (!creds?.access_token) throw new Error("Not authenticated")
  if (creds.refresh_token && !isCoStrictTokenValid(creds)) {
    const next = await refreshCoStrictToken({
      baseUrl: creds.base_url,
      refreshToken: creds.refresh_token,
      state: creds.state,
    })
    await saveCoStrictCredentials({
      ...creds,
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      expiry_date: extractExpiryFromJWT(next.access_token),
      updated_at: new Date().toISOString(),
      expired_at: new Date(extractExpiryFromJWT(next.access_token)).toISOString(),
    })
    creds = { ...creds, access_token: next.access_token, refresh_token: next.refresh_token }
  }
  const headers = new Headers()
  headers.set("Authorization", `Bearer ${creds.access_token}`)
  headers.set("Content-Type", "application/json")
  headers.set("HTTP-Referer", "https://github.com/zgsm-ai/costrict-cli")
  headers.set("X-Title", "CoStrict-CLI")
  headers.set("X-Costrict-Version", `costrict-cli-${Installation.VERSION}`)
  headers.set("X-Request-ID", uuidv7())
  headers.set("zgsm-client-id", Installation.getInstallationId())
  headers.set("zgsm-client-ide", "cli")
  const device = await loadDevice()
  const base = getCloudBaseUrl(device?.base_url || creds.base_url)
  return { base, headers, device }
}

export async function push(items: Report[]) {
  const req = await auth()
  const res = await fetch(getCloudApiUrl("/api/usage/report", req.base), {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({
      reports: items.map((item) => ({
        session_id: item.session_id,
        request_id: item.request_id,
        message_id: item.message_id,
        request_time: item.request_time,
        date: item.date,
        updated: item.updated,
        model_id: item.model_id,
        provider_id: item.provider_id,
        input_tokens: item.input_tokens,
        output_tokens: item.output_tokens,
        reasoning_tokens: item.reasoning_tokens,
        cache_read_tokens: item.cache_read_tokens,
        cache_write_tokens: item.cache_write_tokens,
        cost: item.cost,
        rounds: item.rounds,
        git_repo_url: item.git_repo_url,
        git_worktree: item.git_worktree,
      })),
      device_id: req.device?.device_id,
      reported_at: new Date().toISOString(),
      client_version: Installation.VERSION,
    }),
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(body.error || body.message || `usage push failed: ${res.status}`)
  return body as { accepted?: number; skipped?: number; errors?: string[] }
}
