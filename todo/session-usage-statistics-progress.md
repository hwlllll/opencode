# Session Usage Statistics 任务进度跟踪

> 状态：🚧 进行中  
> 更新时间：2026-04-01  
> 关联提案：
> - `costrict-web/docs/proposals/SESSION_USAGE_STATISTICS_DESIGN.md`
> - `opencode/docs/session-usage-statistics.md`

---

## 1. 任务目标

在 `opencode` 侧实现 session usage statistics 上报能力，按 **单次 assistant 请求** 采集本地用量数据，通过 internal plugin 入队、批量上报到 `costrict-web`，并具备补扫、重试、退出前 flush 等基础可靠性能力。

本任务仅聚焦客户端（`opencode`）范围，服务端接口与存储由 `costrict-web` 侧配套实现。

---

## 2. 范围界定

### 本次实现范围

- 新增 usage internal plugin
- 监听 `message.updated` 事件提取已完成 assistant message 的请求数据
- 透传并持久化 `request_id`
- 解析并规范化 `git_repo_url`
- 使用 JSONL 文件作为本地上报队列
- 批量上报 `/api/usage/report`
- 支持启动补扫、定时 flush、阈值 flush、退出前 flush
- 支持失败重试与最大重试次数控制

### 暂不包含

- Dashboard / UI 展示
- 服务端 SQLite / API / 活跃度查询实现
- ES 双写或迁移
- 复杂权限控制与仓库级 RBAC

---

## 3. 关键依赖与前置条件

### 外部依赖

- `costrict-web` 已提供并联通：`POST /api/usage/report`
- 认证链路可复用现有 CoStrict OAuth / JWT 体系
- 服务端已明确请求体字段与幂等语义：`(user_id, request_id)`

### 内部依赖

- 参考 `src/learning/pusher.ts` 的认证上报模式
- 参考 `src/cli/cmd/stats.ts` 的 usage 聚合逻辑
- 参考 plugin 系统的 `src/plugin/tdd`、`src/learning/plugin.ts`
- 需要确认 assistant message 持久化结构可稳定读取 `message.id`
- 需要补充最小数据透传：`request_id = llm.ts` 中生成的 `X-Request-Id`

---

## 4. 设计结论摘要

### 数据粒度

- 一条上报记录对应一次 assistant 请求
- 不按 session 聚合后再上报，避免同 session 多轮 / 多 model 混淆

### 触发策略

- 主路径：监听 `message.updated`
- 兜底路径：CLI 启动补扫
- 可靠性保障：定时 flush + 批量阈值 flush + 退出前 flush

### 本地缓存策略

- 队列文件：`~/.costrict/usage-queue.jsonl`
- 每行一条待上报记录
- 成功后重写文件移除已确认记录

### 关键识别字段

- `request_id`：请求级幂等主键
- `message_id`：本地稳定数据来源，便于补扫与校验
- `git_repo_url`：上报前标准化，避免仓库 URL 形态不一致导致统计分散

---

## 5. 实施阶段拆解

## Phase 1：打通最小数据链路

**目标**：先让 plugin 能拿到一条可上报的完整 usage report。

### 任务项

- [ ] 梳理 plugin 初始化入口与 internal plugin 注册点
- [ ] 新建目录 `packages/opencode/src/plugin/usage/`
- [ ] 创建 plugin 入口 `index.ts`
- [ ] 接入全局事件监听，识别 `message.updated`
- [ ] 识别 assistant message 完成态
- [ ] 从 message 中提取基础 usage 字段
- [ ] 校验 `message.id` 是否可直接作为 `message_id`
- [ ] 梳理 `request_id` 当前生成与传递路径
- [ ] 在必要位置补充 `request_id` 写入 assistant message 持久化结构

### 交付结果

- plugin 已完成注册
- 可以在本地事件中拿到完整 report 原型对象

### 风险

- `request_id` 目前可能未落盘，需最小侵入补字段
- `message.updated` 事件可能存在多次触发，需避免重复入队

---

## Phase 2：补齐 git 仓库识别与 report 组装

**目标**：让 report 字段满足服务端协议要求。

### 任务项

- [ ] 实现 `git/repo.ts`
- [ ] 基于 worktree 执行 `git remote get-url origin`
- [ ] 实现 URL 标准化：SSH → HTTPS、去 `.git`、去尾 `/`、统一小写
- [ ] 建立 worktree → repo_url 缓存，减少重复 git 调用
- [ ] 组装完整 report 数据结构
- [ ] 补齐时间字段格式：`date` / `updated` 转 ISO date
- [ ] 明确 `rounds` 固定为 1 的实现方式
- [ ] 明确 `git_worktree` 默认是否上传，保留可选能力

### 交付结果

- 生成与提案字段一致的 report payload
- 同一仓库 URL 可稳定归一化

### 风险

- 某些目录不是 git 仓库或无 `origin`
- Windows / WSL / macOS 路径差异可能影响 worktree 判断

---

## Phase 3：实现本地 JSONL 队列与 flush 机制

**目标**：实现可靠缓存，避免网络失败导致数据丢失。

### 任务项

- [ ] 实现 `queue/jsonl.ts`
- [ ] 支持 JSONL 追加写入
- [ ] 支持读取全部待发送记录
- [ ] 支持按已确认记录重写队列文件
- [ ] 为记录补充 `queued_at` 与 `retry_count`
- [ ] 实现 `isFlushing` 防并发 flush
- [ ] 定义 `BATCH_SIZE = 50`
- [ ] 定义 `MAX_RETRIES = 3`
- [ ] 定义 `FLUSH_INTERVAL = 5 min`

### 交付结果

- 本地队列可在进程重启后恢复
- flush 前后队列状态可预期

### 风险

- 文件损坏或部分行非法 JSON 时需决定跳过还是中断
- flush 与入队并发时需保证最终文件内容正确

---

## Phase 4：实现批量上报、认证与重试

**目标**：将本地队列通过认证请求稳定发送到服务端。

### 任务项

- [ ] 实现 `report/push.ts`
- [ ] 复用 `createAuthenticatedFetch()` 或 learning pusher 认证模式
- [ ] 对接 `POST /api/usage/report`
- [ ] 处理响应中的 `accepted / skipped / errors`
- [ ] 成功后移除已确认记录
- [ ] 失败时增加 `retry_count`
- [ ] flush 时跳过超过重试上限的数据
- [ ] 为网络异常、401、5xx 设计最小可行处理策略

### 交付结果

- 本地可完成一次真实上报
- 成功与失败路径均有确定行为

### 风险

- 服务端返回部分成功时，需精确删除成功记录
- token 刷新失败时需避免死循环重试

---

## Phase 5：补扫、生命周期与配置控制

**目标**：补齐插件级运维能力与用户控制开关。

### 任务项

- [ ] 实现 `queue/scan.ts`，CLI 启动时补扫近期 assistant message
- [ ] 设计补扫去重策略，避免与队列内数据重复
- [ ] 注册 `beforeExit` flush
- [ ] 注册定时 flush
- [ ] 设计并读取 `usage.report` 配置项
- [ ] 默认关闭还是默认开启，需与产品预期确认
- [ ] 评估首次上报提示是否在当前阶段落地

### 交付结果

- 异常退出、长时间运行、重启恢复三类场景具备基本可靠性
- 用户可关闭 usage 上报

### 风险

- 补扫范围过大可能影响启动性能
- 配置项落点若分散，容易产生行为不一致

---

## Phase 6：联调与验证

**目标**：确认客户端实现与服务端协议一致，且不会重复或漏报。

### 任务项

- [ ] 构造本地 assistant message 数据样本进行验证
- [ ] 校验同一 `request_id` 重复上报时服务端幂等行为
- [ ] 校验 message 未完成时不会提前入队
- [ ] 校验 git URL 归一化前后结果
- [ ] 校验 flush 成功后队列清理行为
- [ ] 校验失败重试达到阈值后的跳过行为
- [ ] 与 `costrict-web` 进行端到端联调

### 交付结果

- 形成最小可回归验证清单
- 可以稳定演示“本地产生 usage → 服务端收到 report”闭环

---

## 6. 当前建议实现顺序

1. **先做 `request_id` 落盘链路**，这是幂等与补扫的前提。
2. **再做 usage plugin 骨架和 message 事件提取**，验证字段来源。
3. **随后补齐 `git_repo_url` 解析与标准化**，确保 report 结构完整。
4. **之后实现 JSONL 队列与 flush**，补上可靠性。
5. **最后接入补扫、配置与联调**，收敛边界场景。

---

## 7. 阻塞项 / 待确认项

- [ ] `request_id` 在当前 assistant message 持久化模型中的最佳落点
- [ ] `message.updated` 事件负载中是否可直接拿到完整 message 数据
- [ ] `usage.report` 配置项已有配置体系中的接入位置
- [ ] `git_worktree` 是否默认不上报，仅保留可选支持
- [ ] 首次上报提示是否属于本次实现范围
- [ ] 服务端部分成功返回时的精确回执格式是否固定

---

## 8. 风险清单

| 风险 | 影响 | 应对 |
|---|---|---|
| `request_id` 未稳定持久化 | 无法实现请求级幂等 | 优先完成最小字段透传 |
| message 事件多次触发 | 重复入队 / 重复上报 | 仅在 completed 状态入队，并依赖 request_id 去重 |
| git remote 获取失败 | 记录缺失仓库维度 | 失败时跳过上报并记录日志 |
| 队列文件损坏 | 局部记录丢失 | 逐行解析，坏行跳过并保留告警 |
| 服务端部分成功 | 队列无法正确删减 | 约定 accepted/skipped/errors 的可定位回执 |
| 网络或认证异常 | 长时间堆积 | retry_count + 最大重试阈值 |

---

## 9. 里程碑定义

### M1：可提取

- plugin 已注册
- 能从 completed assistant message 提取 report 原型
- `request_id`、`message_id` 已打通

### M2：可入队

- report 可写入 JSONL 队列
- 支持读取与重写

### M3：可上报

- 完成认证请求
- 服务端能收到并接受 report

### M4：可恢复

- 具备启动补扫、定时 flush、退出前 flush、失败重试

---

## 10. 进度记录

| 日期 | 进展 | 备注 |
|---|---|---|
| 2026-04-01 | 创建任务跟踪文档 | 基于 `SESSION_USAGE_STATISTICS_DESIGN.md` 拆解客户端执行计划 |
| 2026-04-01 | 已实现 usage plugin 骨架、request_id 落盘、JSONL 队列、批量上报与 costrict-web 服务端 API 骨架 | 待继续完成联调与验证 |

---

## 11. 完成判定

满足以下条件可视为 `opencode` 侧任务完成：

- [ ] assistant completed message 能稳定产出 usage report
- [ ] `request_id` 已落盘并参与幂等
- [ ] `git_repo_url` 已标准化并进入 payload
- [ ] JSONL 队列可持久化待上报记录
- [ ] 批量上报成功后可正确清理队列
- [ ] 启动补扫 / 定时 flush / 退出前 flush 可用
- [ ] 重试机制生效且不会无限堆积
- [ ] 与 `costrict-web` 联调通过
