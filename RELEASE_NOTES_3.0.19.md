# CoStrict v3.0.19 Release Notes

> 基于 tag `3.0.18` 到 `release/3.0.19` 分支的变更整理，共计 662 个提交。

---

## 一、CoStrict 平台功能

### 1. Cloud 云端能力

- **Cloud Daemon 模式**: 将 cs cloud 改造为 daemon 模式，修复隧道连接问题
- **Cloud Tunnel**: 新增 cloud tunnel 命令和设备隧道实现，支持 WebSocket 代理（raw TCP socket）
- **Cloud 通知上报**: 新增 cloud 通知上报模块，支持干预事件推送至企业微信等渠道
- **Cloud 设备代理**: 通过 `VITE_OPENCODE_CLOUD_DEVICE_ID` 支持云端设备代理模式
- **Cloud 文件 API**: 新增 cloud config 和 cloud file API 路由
- **TLS 验证**: 支持跳过 TLS 证书验证（`skip TLS certificate verification`）
- **Auth Token**: 为 gateway/tunnel 添加认证 token，设备注册移至前台
- **SSE 重连优化**: 改善 SSE 重连处理，延长心跳超时
- **Gateway 重连**: 修复 gateway 重启后 cs cloud 不重连的问题
- **Daemon 进程管理**: 使用 stop-signal 文件实现 Windows 上的优雅关闭

### 2. Workspace 工作区

- **工作区重命名**: 支持工作区重命名功能
- **工作区主页**: 新增 Workspace Home 教程引导页
- **工作区路由重构**: 路由结构调整为 `/workspace/:workspaceID/:dir` 模式
- **工作区导航 Hook**: 新增 `useWorkspaceNavigate` 统一导航
- **设备直接创建工作区**: 点击设备可直接创建工作区
- **工作区侧边栏重设计**: 全新的工作区侧边栏 UI 布局和交互
- **状态隔离**: 按 device/workspace 隔离持久化状态，避免跨设备冲突
- **设备轮询优化**: 添加可见性守卫、并发锁和工作区状态同步
- **工作区加载优化**: 优化工作区和设备的加载逻辑

### 3. Store 应用商店

- **商店首页重构**: 全新的 Workspace Home Page 和 Store 路由
- **最佳实践轮播**: 替换静态卡片为动态轮播，支持收藏/跟踪
- **分类筛选器**: 实现 CategoryFilter 组件并集成到多个页面
- **语义搜索**: 为 skills 添加语义搜索支持
- **安全徽章**: 新增安全徽章组件和扫描状态展示
- **扫描结果展示**: 新增扫描结果显示和相关数据结构
- **统计计数**: 添加统计计数和收藏切换功能
- **仓库同步状态**: 展示同步状态并支持手动触发同步
- **能力迁移对话框**: 实现 move capability 对话框
- **物品详情**: 添加 JSON 高亮和改进内容渲染
- **仓库邀请**: 新增仓库邀请对话框
- **归档上传**: 实现归档上传功能
- **确认对话框**: 新增 ConfirmDialog 组件
- **动画光效**: 为 item cards 添加动画光效效果

### 4. 设备管理

- **设备管理服务**: 实现设备管理服务及 API 集成
- **设备状态指示器**: 用语义化圆点指示器替换文本徽章
- **设备列表 UI**: 重构设备列表 UI

### 5. 通知渠道

- **企业微信通知**: 新增企业微信（WeCom）通知渠道管理
- **编辑对话框**: 为企业微信渠道添加编辑对话框

### 6. 认证体系

- **认证 Provider**: 新增认证 provider
- **Auth Guard**: 为受保护路由添加认证守卫并增强登录引导 UI
- **Casdoor OAuth**: 将 Casdoor OAuth 逻辑从前端迁移到后端

### 7. 国际化 (i18n)

- 设备管理、通知渠道、工作区相关组件的 i18n 支持
- 用户菜单翻译
- 工作区空会话翻译
- 分类/类型 i18n 统一到共享常量

---

## 二、安装与升级

- **安装前检查**: 添加预安装检查、安装后验证和改进的错误诊断
- **交互式升级流程**: 非 patch 版本支持交互式升级流程
- **升级健壮性**: 增强升级过程的健壮性

---

## 三、核心引擎升级（合并上游 v1.3.0 ~ v1.3.13）

### AI SDK & 模型

- **AI SDK v6 升级**: 全面支持 AI SDK v6
- **Prompt Caching**: 为 google-vertex-anthropic 启用 prompt 缓存和 cache token 跟踪
- **Bedrock Token 缓存**: 为所有 amazon-bedrock provider 添加 token 缓存
- **xAI Responses API**: 切换 xai provider 到 responses API
- **模型变体选择**: 新增模型变体选择对话框（替代循环切换）
- **Kimi 专用提示**: 为 Kimi 模型添加专用系统提示词
- **GPT 提示优化**: 为非 codex 的 GPT 模型添加专属系统提示
- **Token 计数修复**: 修复 anthropic & bedrock 因 AI SDK v6 升级导致的 token 使用量重复计算
- **vLLM 上下文溢出检测**: 检测 vLLM 上下文溢出错误
- **X-Request-Id**: 为 LLM 请求附加 X-Request-Id，并包含在 SSE 超时错误中

### TUI 终端界面

- **语法高亮**: 新增 Kotlin、HCL、Lua、TOML 语法高亮
- **TUI 插件**: 支持 TUI 插件系统
- **堆快照**: 新增 TUI 和 server 的堆快照功能
- **交互式更新**: 非 patch 发布的交互式更新流程
- **WebUI 内嵌**: 将 WebUI 嵌入二进制文件（带代理标志）
- **Markdown 渲染优化**: 减少 markdown 流式渲染的抖动
- **Changelog 斜杠命令**: 新增 changelog 斜杠命令
- **提示槽位**: 新增 prompt slot 功能

### Web App

- **启动性能优化**: 多轮启动性能优化
- **文件树默认收起**: 文件树默认收起并设最小宽度
- **会话时间线**: 修复会话时间线滚动跳动
- **消息导航**: 将消息导航从 cmd+arrow 移开
- **键盘项目切换**: 支持键盘快捷键切换项目
- **多文件附件**: 桌面端文件类型过滤和多文件支持
- **批量文件附件**: 批量处理多文件 prompt 附件
- **Review 功能**: 行内 review 评论提交和布局改进

### 插件系统

- **插件生命周期**: 改进插件系统健壮性（agent/command 解析、异步错误、hook 时序、两阶段初始化）
- **插件 hook 异步**: 修复插件 hook 以正确处理异步操作
- **插件主题更新**: 插件更新时同步更新主题
- **单目标入口点**: 支持单目标插件入口点
- **JSONC 注释保留**: 插件安装时保留 JSONC 注释

### MCP (Model Context Protocol)

- **连接超时处理**: 关闭失败/超时的 MCP 连接 transport
- **HTTP/SSE 支持**: 注册表支持 http/sse MCP 类型（通过标准化到 remote）
- **SDK 升级**: 升级 modelcontextprotocol/sdk 到 1.27.1

### Effect 架构重构

大规模使用 Effect 框架重构核心服务（提升类型安全性和可组合性）：
- Session 系列: SessionPrompt, SessionCompaction, SessionProcessor, SessionRevert, SessionSummary, SessionStatus
- 核心服务: Config, Provider, Storage, Plugin, Command, Skill, Project, Installation
- 文件服务: FileService, FileTimeService, FileWatcher, AppFileSystem
- 其他: VcsService, FormatService, SnapshotService, TruncateService, ToolRegistry, Pty, LSP, Bus, Worktree

### Windows 平台

- **PowerShell 支持**: 一等公民的 pwsh/powershell 支持
- **cross-spawn**: 为 shim-backed 命令使用 cross-spawn
- **进程管理**: 为所有子进程 spawn 调用添加 windowsHide
- **Kitty 键盘**: Windows Terminal 1.25+ 的图片粘贴支持
- **E2E 稳定性**: CrossSpawnSpawner、快照隔离、会话竞态保护

### Node.js 兼容性

- **Node.js 入口点**: 新增 Node.js 入口点和构建脚本
- **运行时抽象**: 替换 Bun 特有 API 为可移植替代方案
- **SQLite 抽象**: 将 SQLite 抽象为运行时条件的 #db import
- **Process 工具**: 替换 Bun shell 执行为可移植 Process 工具

### Docker 部署

- **Docker 支持**: 新增 Docker 部署支持
- **运行时环境变量注入**: Docker 运行时环境变量注入
- **Bun 静态服务器**: 替换 nginx 为 bun 静态服务器（支持 WebSocket 代理）
- **多平台构建优化**: 使用 BUILDPLATFORM 优化多平台构建
- **子目录部署**: 支持 VITE_BASE_PATH 子目录部署

---

## 五、Learning / Skill 自学习系统

- **Skill 自进化**: 客户端 skill 自进化系统
- **Skill 捕获**: 新增 skills-capture 命令和学习模块
- **Skill 推送**: 新增 skill push 命令
- **Skill 生成优化**: 改进 skill 生成 UX 和 JSON 解析健壮性
- **插件注册表**: 插件注册表客户端、安装器和记录模块
- **cs plugin 命令**: 新增 `cs plugin` 命令用于安装注册表扩展
- **认证拉取**: 扩展 skill 发现以支持认证拉取
- **技能构建缓存**: 当 GitHub 仓库不可访问时回退到本地缓存 skills

---

## 六、其他改进

### 性能优化

- 启动效率多轮优化（启动阶段计时、命令目录高效初始化）
- 静态资源缓存控制头
- 禁用不必要的 health polling
- 消除 SessionTurn 中的 N+1 响应式订阅
- 文件和 skill 使用 Effect.cached 去重

### 安全与合规

- 修复 Windows 上 targetPath 未解析为绝对路径的问题
- 避免快照超过 2MB 的文件
- CSP 策略优化（hash inline script）

### 桌面应用 (Electron)

- 多步认证流程集成
- 远程服务器切换修复
- macOS dock 图标 inset 修复
- 更健壮的 sidecar kill 处理
- 延迟读取 updater enabled

### 第三方集成

- **Poe OAuth**: 新增 Poe OAuth 认证插件
- **GitLab**: 支持 GitLab Agent Platform 和工作流模型发现，DWS 工具审批支持
- **GitHub Copilot Enterprise**: 修复 GitHub Copilot Enterprise 集成
- **Cloudflare Workers AI**: 新增 Cloudflare Workers AI provider 文档
- **Salesforce**: 企业联系表单推送至 Salesforce

---

## 七、关键 Bug 修复

- 修复 token 使用量因 AI SDK v6 升级的重复计算问题
- 修复 SPA fallback 导致的刷新白屏
- 修复子 agent 不可点击的问题
- 修复压缩时未应用消息转换的问题
- 修复 fork 会话附件丢失文件部分的问题
- 修复 agent 切换不应重置 thinking level
- 修复 ZlibError 分类为可重试而非未知错误
- 修复 HEAD 过滤 bug（VcsService）
- 修复 provider models.dev 获取失败时的优雅处理
- 修复 CUSTOM_LOADERS 的动态模型未传递给 provider
- 修复企业 URL 在认证流程中的正确设置
- 修复 LiteLLM 压缩时的 _noop 工具调用
- 修复多个工作区关闭后的内存泄漏（session list polling leak）
- 修复 prompt 工具 enables 在空 agent 权限时被清除
