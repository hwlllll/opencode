# Local Mode 移除进度跟踪

> 目标：移除 `packages/app-ai-native` 中已废弃的 local 模式代码，保留 device 模式作为唯一运行模式。

## 阶段一：移除 local 模式专用文件

可直接删除，无 device 模式依赖。

- [x] `src/pages/layout.tsx` — local 模式主侧边栏布局（~2216 行）
- [x] `src/pages/layout/` 整个目录 — 侧边栏辅助模块
  - `helpers.ts`（`workspaceKey` 已迁移到 `src/lib/workspace-key.ts`，测试迁移到 `src/lib/workspace-key.test.ts`）
  - `deep-links.ts`
  - `inline-editor.ts`
  - `sidebar-workspace.tsx`
  - `sidebar-project.tsx`
  - `sidebar-shell.tsx`
  - `sidebar-workspace-helpers.ts`
  - `sidebar-items.tsx`
  - `helpers.test.ts`（`workspaceKey` 测试已迁移，其余 deep-link/local-mode 测试随目录删除）
- [x] `src/pages/home.tsx` — local 模式首页（最近项目）
- [x] `src/app-interface.tsx` — local 模式 AppInterface 包装器
- [x] `src/components/dialog-select-server.tsx` — 服务器选择对话框
- [x] `src/components/dialog-select-directory.tsx` — 目录选择对话框
- [x] `src/components/titlebar.tsx` — 桌面端标题栏
- [x] `src/app.tsx` 中清理
  - [x] 移除 `AppInterface` 函数
  - [x] 移除 `AppShellProviders` 函数、`RouterRoot` 函数
  - [x] 移除 `Layout` / `Home` / `DirectoryLayout` 等 local 模式 import
  - [x] 清理 `src/index.ts` 中对 `AppInterface` 的导出
- [x] 清理 `status-popover.tsx` 中对已删除 `DialogSelectServer` 的未使用 import
- [x] 清理 `workspace/components/layout.tsx` 中对已删除 `AppInterface` 的未使用 import
- [x] `workspaceKey` 迁移到 `src/lib/workspace-key.ts`，更新 4 处引用
- [x] `bun typecheck` 通过

## 阶段二：清理 deviceMode 分支逻辑

移除后 deviceMode 不再存在，所有分支简化为 device 模式路径。

- [x] `src/components/prompt-input/submit.ts`
  - [x] 行 82: 移除 `layout.deviceMode &&` 条件，直接取 `(sync as any).currentSessionID?.()`
  - [x] 行 85-91: 移除 `!layout.deviceMode` 分支（globalSync todo 清理逻辑），保留 device 模式的 `sync.set("todo", ...)`
  - [x] 行 153: 移除 `layout.deviceMode &&` 条件
  - [x] 行 219: 移除 `!layout.deviceMode` 分支（navigateToSession 逻辑）
  - [x] 移除未使用的 `useLayout`、`useWorkspaceNavigate` import
- [x] `src/pages/session/message-timeline.tsx`
  - [x] 行 445: 移除 `layout.deviceMode` 分支，`sync.navigateBack()` 改为无条件执行
  - [x] 移除未使用的 `useLayout` import 和 `layout` 变量
- [x] `src/context/layout.tsx`
  - [x] 移除 `deviceMode: false as boolean` 字段
- [x] `src/pages/workspace/components/layout.tsx`
  - [x] 移除 `deviceMode: true as boolean` 字段
- [x] `src/pages/workspace/components/device-interface.tsx`
  - [x] 移除 `deviceMode: true as boolean` 字段
- [x] `bun typecheck` 通过

## 阶段三：重构共享 Context

这些文件被 device 模式通过 `DirectoryLayout` 和 `device-session-tab` 使用，不能直接删除，需要逐步剥离 local 模式概念。

- [x] `src/context/server.tsx`
  - [x] 移除 `isLocal()` 计算属性及其唯一消费者 `session-header.tsx`
  - [x] 移除 `Sidecar` 和 `Ssh` 连接类型，`ServerConnection.Any` 简化为仅 `Http`
  - [x] 简化 `key()` 函数（从 switch 改为直接返回）
  - [x] 移除 `projectsKey` 中的 `sidecar` 分支
  - [x] 保留 `ServerProvider` / `useServer`（device 模式仍使用）
- [x] `src/components/session/session-header.tsx`
  - [x] 移除 `canOpen` memo（`isLocal()` 永远为 false）
  - [x] 移除桌面端"Open with app"按钮 + DropdownMenu（~90 行死代码）
  - [x] 简化为仅保留"Copy path"按钮
  - [x] 移除 `openDir`、`selectApp`、`opening`、`menu` 等桌面端专用状态
  - [x] 移除未使用的 `useServer` import
- [x] `src/components/status-popover.tsx`
  - [x] 移除所有注释掉的代码块（servers tab、plugins tab、health polling、~150 行）
  - [x] 移除未使用的 `pluginEmptyMessage`、`listServersByHealth`、`useDefaultServerKey` 函数
  - [x] 移除未使用的 import（`useDialog`、`useNavigate`、`useServer`、`ServerConnection`、`ServerHealth` 等）
- [x] `src/context/layout.tsx`
  - [x] 提取显式 `LayoutValue` 接口类型，替换 750+ 行推断类型
  - [x] 用 `createContext` + `useContext` 替换 `createSimpleContext`
  - [x] 删除整个 init 函数体（~750 行死代码：项目持久化、滚动追踪、session 管理、侧边栏状态等）
  - [x] 保留 `useLayout`、`LayoutContext`、`ReviewDiffStyle`、`LocalProject`、`getAvatarColors` 导出
- [x] `src/context/layout.test.ts` — 删除（测试已移除的 init 辅助函数）
- [x] `src/context/layout-scroll.ts` + `layout-scroll.test.ts` — 删除（仅被已删除的 init 使用）
- [x] `src/components/server/server-row.tsx` — 删除（无消费者）
- [x] `src/utils/server-health.ts` + `server-health.test.ts` — 删除（仅被 server-row 和注释代码引用）
- [x] `src/context/server.tsx` — 清理注释掉的 health polling 代码（~30 行）
- [x] `src/context/sync.tsx` / `global-sync.tsx` / `local.tsx` — 已是纯 context shell（createContext + useContext），device-session-tab 用作 bridge，无需进一步简化
- [x] `src/context/terminal.tsx` — 已简化为 device-terminal 的 re-export
- [x] `src/context/sdk.tsx` — 移除 `createSimpleContext` 及其未使用的 `init` 函数，改为纯 `createContext` + `useContext`（~40 行 → ~16 行）
- [x] `src/context/permission.tsx` — 同上，移除未使用的 `PermissionProvider` 和 stub `init`，改为纯 `createContext` + `useContext`
- [x] `src/hooks/use-providers.ts` — 移除 local 模式 fallback 路径（useGlobalSync + useSDK 分支），仅保留 DeviceWorkspaceContext 路径

### 阶段三额外清理

- [x] `src/components/server/server-row.tsx` — 删除（无消费者）
- [x] `src/utils/server-health.ts` + `server-health.test.ts` — 删除（仅被 server-row 和注释代码引用）

## 阶段四：验证 & 清理

- [x] 运行 `bun typecheck` 确保无类型错误 ✅ 通过（exit code 0）
- [x] 运行 lint 检查 — 该包无 lint 脚本，跳过
- [x] 确认 `device-session-tab.tsx` 中的 stub provider 桥接正常（10 个 Context.Provider 嵌套平衡、顺序正确）
- [x] 确认 `DeviceInterface` 的 provider 链路完整（DeviceClientProvider → DeviceInitGate → DeviceLayoutProvider → DirectoryContext → DeviceSDKProvider → WorkspaceInitGate → DeviceWorkspaceProvider → DeviceFileProvider → DeviceTerminalProvider → DeviceLocalProvider）
- [x] 全局检查无残留引用（已删除文件、deviceMode 关键词均无匹配）
- [ ] 手动验证 device 模式下 session 创建、消息收发、终端等核心功能（需运行时验证）

## 影响范围统计

| 阶段 | 删除/清理行数 | 状态 |
|---|---|---|
| 阶段一：移除专用文件 | ~3000+ 行 | 已完成 |
| 阶段二：清理分支逻辑 | ~50 行 | 已完成 |
| 阶段三：重构共享 Context | ~1200 行 | 已完成 |
| 阶段四：验证 | — | 已完成（静态验证通过，运行时需手动验证） |

## 备注

- `DirectoryLayout`（`src/pages/directory-layout.tsx`）是 device 路由树的一部分，但它使用 local 模式的 context（SDKProvider、SyncProvider、LocalProvider）。这意味着 local 模式的 context 不能直接删除，需要先完成 device 模式对其的解耦。
- `device-session-tab.tsx` 通过 stub 方式桥接了 local 模式的 context 接口（SyncContext、LocalContext、SDKContext 等），这是一种适配器模式。
