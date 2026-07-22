/**
 * CoStrict OAuth 参数构建模块
 * 统一管理所有 OAuth 端点使用的通用参数
 */

import { Installation } from "../../installation"

/**
 * 构建标准的 OAuth 查询参数
 * 统一管理所有 OAuth 端点使用的通用参数
 *
 * @param includeMachineCode 是否包含 machine_code 参数 (登录和轮询时需要，刷新时不需要)
 * @param machineId 机器唯一标识 (当 includeMachineCode 为 true 时必须提供)
 * @param state OAuth state (可选)
 * @returns 查询参数数组
 */
export function buildOAuthParams(
  includeMachineCode: boolean,
  machineId?: string,
  state?: string,
): [string, string][] {
  const params: [string, string][] = []

  // machine_code 参数 (登录和轮询时需要)
  if (includeMachineCode) {
    if (!machineId) {
      throw new Error("machineId is required when includeMachineCode is true")
    }
    params.push(["machine_code", machineId])
  }

  // state 参数 (可选)
  if (state) {
    params.push(["state", state])
  }

  // 通用参数
  const version = `costrict-cli-${Installation.VERSION}`
  params.push(
    ["provider", "casdoor"],
    ["plugin_version", version],
    ["vscode_version", version],
    ["uri_scheme", "costrict-cli"],
  )

  return params
}
