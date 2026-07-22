import { Installation } from "../../installation"

export async function getAppUrl(baseUrl: string | undefined): Promise<string> {
  // 如果已通过环境变量设置，直接使用
  const envUrl = process.env["COSTRICT_APP_URL"]
  if (envUrl) return envUrl

  // 如果没有设置baseUrl，使用默认值
  const base = baseUrl ?? "https://zgsm.sangfor.com"
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base

  // 获取当前版本号
  const version = Installation.VERSION

  // 如果版本号是 "local"，直接使用 dist
  if (version === "local") {
    return `${normalizedBase}/costrict/opencode-web/dist/`
  }

  // 构建版本目录URL和默认目录URL
  const versionUrl = `${normalizedBase}/costrict/opencode-web/${version}/`
  const distUrl = `${normalizedBase}/costrict/opencode-web/dist/`

  // 检查版本目录是否存在
  try {
    const response = await fetch(versionUrl, { method: "HEAD" })
    if (response.ok) {
      return versionUrl
    }
  } catch (e) {}

  // 版本目录不存在或无法访问，使用默认的dist目录
  return distUrl
}
