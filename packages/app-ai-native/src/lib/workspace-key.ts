export const workspaceKey = (directory: string) => {
  const normalized = directory.replace(/\\+/g, "/")
  const drive = normalized.match(/^([A-Za-z]:)\/+$/)
  if (drive) return `${drive[1]}/`
  if (/^\/+$/g.test(normalized)) return "/"
  return normalized.replace(/\/+$/, "")
}
