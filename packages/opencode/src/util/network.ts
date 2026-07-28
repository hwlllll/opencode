export function online() {
  const offline = process.env.COSTRICT_OFFLINE?.toLowerCase()
  if (offline === "true" || offline === "1") return false
  const nav = globalThis.navigator
  if (!nav || typeof nav.onLine !== "boolean") return true
  return nav.onLine
}

export function proxied() {
  return !!(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy)
}
