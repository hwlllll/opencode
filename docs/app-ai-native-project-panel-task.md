# app-ai-native 项目面板任务说明书

> 目标：基于 `costrict-web` 中的项目管理与项目成员仓库活动提案，在 `@opencode-ai/app-ai-native` 中新增“项目面板（Projects Panel）”与“项目成员仓库活动”视图所需的前端任务说明，作为后续实现依据。

---

## 1. 背景

当前 `costrict-web` 已有两份相关设计提案：

- `PROJECT_MANAGEMENT_DESIGN.md`
- `PROJECT_MEMBER_REPO_ACTIVITY_DESIGN.md`

两份提案共同定义了以下能力：

1. 引入项目实体 `Project`
2. 引入项目成员 `ProjectMember`
3. 引入项目邀请 `ProjectInvitation`
4. 新增项目仓库绑定 `ProjectRepository`
5. 提供项目成员在项目仓库下的活跃度聚合查询接口

而 `@opencode-ai/app-ai-native` 当前已经具备多组顶层页面结构：

- 顶层路由入口：
  - `/workspace`
  - `/store`
- `store` 页面已有独立布局与侧边导航：
  - `src/pages/store/components/layout.tsx`
  - `src/pages/store/components/sidebar.tsx`

因此，本任务不应再挂载到 `store/dashboard` 下，而应作为与 `store`、`workspace` **同级的顶层信息架构入口**来设计新增“项目面板”与对应的“成员仓库活动”页面能力。

补充要求：项目相关 UI 的设计布局、卡片组织、区块层次、表格与筛选区域风格，应尽可能参考 `packages/app-ai-native/src/pages/store/pages/home.tsx` 当前 store 首页的视觉与结构表达方式，在独立的顶层页面容器内复用类似的页面节奏，而不是另起一套明显不同的后台风格。

---

## 2. 任务目标

### 2.1 核心目标

在 `packages/app-ai-native` 中新增项目管理面板，支持用户：

1. 在左侧边栏看到“项目管理 / Projects”入口
2. 查看自己可访问的项目列表，并可选择进入单个项目
3. 查看单个项目详情
4. 查看项目成员列表
5. 支持邀请成员加入项目
6. 支持查看项目邀请结果 / 邀请状态
7. 查看并管理项目关联仓库
8. 查看“项目成员分别在哪些 git repo 下有活动”的总览
9. 在项目视角下区分：
   - 项目未绑定仓库
   - 已绑定仓库但最近无活动
   - 有活动数据

### 2.2 本期优先范围

优先实现只读/轻交互的项目面板能力，重点放在“项目成员仓库活动视图”。

建议本期范围：

- 项目列表页
- 项目详情页
- 项目成员列表与邀请结果展示
- 项目仓库关联列表
- 项目成员仓库活动 tab
- 项目仓库列表展示
- 时间范围切换（7d / 30d / 90d）
- 仅显示活跃成员/仓库的筛选

### 2.3 非目标

本任务说明书不要求本期必须完成：

- 复杂项目创建向导
- 邀请流程全链路交互完善
- 项目仓库自动发现
- 仓库/成员趋势图
- 项目级 token/cost BI 大盘

---

## 3. 依赖提案摘要

### 3.1 项目管理提案提供的后端对象

后端将提供以下概念与接口能力：

- `Project`
- `ProjectMember`
- `ProjectInvitation`
- 项目 CRUD
- 成员管理
- 邀请管理

参考接口：

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`
- `GET /api/projects/:id/members`
- 其他 invitation / archive 能力

### 3.2 项目成员仓库活动提案提供的后端对象

后端将新增：

- `ProjectRepository`
- 项目仓库管理接口
- 项目成员仓库活动聚合接口

参考接口：

- `GET /api/projects/:id/repositories`
- `POST /api/projects/:id/repositories`
- `DELETE /api/projects/:id/repositories/:repoBindingId`
- `GET /api/projects/:id/repo-activity?days=7`

核心响应结构包括：

- `project`
- `range`
- `summary`
- `members`
- `repositories`

其中：

- `members[]`：每个成员活跃过哪些 repo
- `repositories[]`：每个 repo 下有哪些成员活跃

---

## 4. app-ai-native 当前结构分析

### 4.1 现有路由结构

当前 `src/routes.tsx` 中已存在：

- `/store`
- `/workspace`

说明：项目面板应作为与 `store`、`workspace` 并列的顶层入口，而不是继续挂在 `store/dashboard` 下。

### 4.2 现有 store 结构

当前 store 页面主要由以下文件组成：

- `src/pages/store/components/layout.tsx`
- `src/pages/store/components/sidebar.tsx`
- `src/pages/store/pages/home.tsx`

说明：新项目页面在组织形式上应尽量与顶层 `store` 页面保持一致，并在视觉与区块编排上尽量参考 store 首页，包括：

- 顶部标题区
- hero / summary cards + section blocks 的组织方式
- 类似 `store-page` / `store-section` / `store-content-shell` 的页面层次感
- 卡片栅格、说明文案、筛选区与表格区的组合方式
- 卡片式内容区
- `createStore` 状态管理风格
- `Show` / `For` / `createMemo` 的使用方式
- 通过 i18n key 管理文案

### 4.3 i18n 现状

现有项目使用：

- `src/i18n/zh.ts`
- `src/i18n/en.ts`

已有 store 导航 key 示例：

- `store.home.*`
- `store.sidebar.*`

因此本任务必须同步补齐项目相关国际化文案。

---

## 5. 建议实现范围

## 5.1 信息架构

建议新增顶层项目入口：

- `Projects` / `项目管理`

要求：

- 作为与 `store`、`workspace` 同级的信息架构入口
- 用户进入项目入口后应先看到项目列表页，再选择进入具体项目
- 项目页面内部可拥有自己的侧边栏或列表导航，但不再依附 `store` 内部的 dashboard/sidebar 结构

建议新增路由：

- `/projects`
- `/projects/:id`

其中：

1. `/projects`
   - 项目列表页
2. `/projects/:id`
    - 项目详情页
    - 内部通过分块展示为主，必要时后续再增强为 tab：
      - 基本信息
      - 成员
      - 邀请与邀请结果
      - 仓库
      - 成员仓库活动

### 5.2 页面拆分建议

建议新增以下页面/组件：

#### 路由页

- `src/pages/projects/pages/projects-home.tsx`
- `src/pages/projects/pages/project-detail.tsx`

#### 组件层

- `src/pages/projects/components/project-card.tsx`
- `src/pages/projects/components/project-summary-cards.tsx`
- `src/pages/projects/components/project-invite-dialog.tsx`
- `src/pages/projects/components/project-invitations-table.tsx`
- `src/pages/projects/components/project-bind-repository-dialog.tsx`
- `src/pages/projects/components/project-members-table.tsx`
- `src/pages/projects/components/project-repositories-table.tsx`
- `src/pages/projects/components/project-repo-activity-members-table.tsx`
- `src/pages/projects/components/project-repo-activity-repositories-table.tsx`
- `src/pages/projects/components/project-range-switch.tsx`
- `src/pages/projects/components/project-empty-state.tsx`

#### API 层

建议优先新增独立项目域 API 文件，而不是继续扩充现有 `src/pages/store/lib/api.ts`：

- `projectsApi.listMy()`
- `projectsApi.get(id)`
- `projectsApi.listMembers(id)`
- `projectsApi.listInvitations(id)`
- `projectsApi.inviteMember(id, payload)`
- `projectsApi.listRepositories(id)`
- `projectsApi.bindRepository(id, payload)`
- `projectsApi.unbindRepository(id, repoBindingId)`
- `projectsApi.getRepoActivity(id, params)`

建议新增：

- `src/pages/projects/lib/project-api.ts`

可选补充：

- `src/pages/projects/lib/project-types.ts`

说明：当前 `store/lib/api.ts` 已承载 repositories / capabilities / devices / notifications 等多个域能力，项目域建议独立维护，避免文件职责继续膨胀；同时项目内已有其他上下文使用 `projectApi` 命名，因此此处统一建议使用 `projectsApi`，既避免语义冲突，也更贴合顶层 `projects` 模块命名。

---

## 6. 数据结构建议

前端建议显式定义项目域类型，避免直接在页面中散落使用后端原始结构。

建议类型：

```ts
type Project = {
  id: string
  name: string
  description?: string
  creatorId: string
  enabledAt?: string | null
  archivedAt?: string | null
  createdAt: string
  updatedAt?: string
}

type ProjectMember = {
  id: string
  projectId: string
  userId: string
  username?: string
  role: "admin" | "member"
  joinedAt: string
}

type ProjectInvitation = {
  id: string
  projectId: string
  inviteeId?: string
  inviteeUsername?: string
  inviterId: string
  inviterUsername?: string
  role: "admin" | "member"
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled"
  createdAt: string
  updatedAt?: string
  expiresAt?: string
}

type ProjectRepository = {
  id: string
  projectId: string
  gitRepoUrl: string
  displayName?: string
  source?: string
  lastActivityAt?: string | null
}

type ProjectRepoActivitySummary = {
  memberCount: number
  repositoryCount: number
  activeMemberCount: number
  activeRepositoryCount: number
  totalRequests: number
}
```

活动接口结构建议与提案保持一致，不在前端自行发明新字段名，必要时只做 normalize。

补充建议：normalize 后的前端类型应尽量服务于项目页面展示，而不是简单透传后端原始结构；页面层应只消费整理后的稳定字段，以降低后端字段演进对 UI 的影响。

---

## 7. 页面交互要求

### 7.1 项目列表页

页面目标：让用户快速看到自己可访问的项目，并进入项目详情。

建议展示字段：

- 项目名称
- 描述
- 项目状态（活跃 / 已归档）
- 创建时间或最近更新时间

补充说明：

- 成员数、仓库数仅在项目列表接口直接提供统计字段时展示
- 本期不建议为列表页额外发起 `members/repositories` 的 N+1 聚合请求，以避免列表页加载抖动和实现复杂度上升

建议交互：

- 点击项目卡片进入详情页
- 页面布局尽量参考 store 首页：顶部标题 + summary cards / 列表卡片区的节奏
- 提供“空态”文案
- 若用户未登录，展示登录引导

### 7.2 项目详情页

建议分四块内容：

1. 顶部基础信息卡
2. 汇总卡片区
3. 成员与邀请管理区
4. 仓库关联与仓库活动区

实现建议：

- 本期优先采用**单页分块展示**，与现有顶层 `store` 页面风格保持一致
- 页面布局应尽量靠近 store 首页的 section 化组织方式：各区块之间通过标题、副标题、卡片/表格壳层清晰分隔
- `tab` 结构作为后续增强项保留，不要求第一版即引入额外的 tab 状态管理、懒加载与切换逻辑
- 页面应优先保证 repo activity 主路径可用，其次再补齐辅助区块的展示完整性

### 7.3 项目成员与邀请区

建议包含：

- 成员列表
- 邀请成员入口（按钮 + dialog）
- 邀请记录 / 邀请结果列表

成员列表建议列：

- 成员名
- 角色
- 加入时间
- 最近活跃时间（如可从活动接口推导）

邀请结果建议列：

- 被邀请人
- 邀请角色
- 邀请人
- 邀请状态（pending / accepted / rejected / expired）
- 发起时间
- 过期时间

交互要求：

- 邀请成员的交互风格可参考现有 repository `InviteDialog`
- 邀请成功/失败应使用 toast
- 邀请结果不能只靠 toast 瞬时反馈，详情页内应保留可回看的邀请状态列表

### 7.4 项目仓库关联区

建议包含：

- 当前已关联仓库列表
- 关联仓库入口（按钮 + dialog / 选择器）
- 解绑仓库操作（若本期开放）

建议展示字段：

- 仓库名
- git repo URL
- 来源/source
- 最近活跃时间
- 活跃成员数
- 总请求数

交互要求：

- 支持用户查看当前项目关联了哪些仓库
- 支持从项目详情页发起仓库关联
- 若本期不开放解绑，也应在文档中明确仅只读展示；若开放解绑，则需确认操作与 toast 反馈

### 7.5 项目成员仓库活动区

这是本任务的核心区块。

建议包含：

#### 顶部汇总卡片

- 项目成员数
- 项目仓库数
- 最近 N 天活跃成员数
- 最近 N 天活跃仓库数
- 最近 N 天总请求数

#### 时间范围切换

- 7d
- 30d
- 90d

#### 筛选项

- 仅显示有活动成员
- 仅显示有活动仓库

#### 视图一：成员视角表格

建议列：

- 成员名
- 角色
- 活跃仓库数
- 总请求数
- 活跃仓库列表
- 最近活跃时间

#### 视图二：仓库视角表格

建议列：

- 仓库名
- git repo URL
- 活跃成员数
- 总请求数
- 活跃成员列表
- 最近活跃时间

---

## 8. 空态与异常态要求

必须清晰区分以下场景：

### 8.1 未登录

- 显示登录引导
- 按现有顶层页面风格跳转登录

### 8.2 无项目

- 项目列表为空
- 显示“暂无项目”空态

### 8.3 项目存在，但无仓库

- 详情页应提示“该项目尚未绑定仓库”
- 不能误显示为“无活动”
- 应保留“关联仓库”入口，鼓励用户继续完成配置

### 8.4 项目已绑定仓库，但近期无活动

- 显示 summary 中活跃成员/活跃仓库为 0
- 成员/仓库列表仍可展示基础信息
- 明确文案：“最近 N 天暂无活动”

### 8.4.1 项目有邀请记录，但暂无成员活跃

- 邀请列表仍应可见
- 不应因“暂无活动”而隐藏成员/邀请管理区
- 应明确“邀请状态”和“活跃状态”是两类不同信息

### 8.5 权限不足

- 403 场景给出明确提示
- 不要默默显示空数据

### 8.6 接口失败

- 使用 toast 或页面错误态提示
- 支持重试

---

## 9. 路由与导航改造任务

### 9.1 路由新增

在 `src/routes.tsx` 中新增：

- `ProjectsHome`
- `ProjectDetail`

建议形态：

```tsx
{ path: "/projects", component: ProjectsHome }
{ path: "/projects/:id", component: ProjectDetail }
```

### 9.2 顶层导航改造

项目入口不再放入任何 `store` 内部 sidebar，而应作为与 `store`、`workspace` 同级的顶层入口进行接入。

如当前应用已有全局侧边栏/顶部导航承载顶层页面切换，应在对应导航中增加：

- href: `/projects`
- label: `projects.nav.title`（或后续统一命名）
- icon: 建议使用现有可用项目/目录类 icon

要求：

- 与现有顶层入口（如 `store`、`workspace`）风格一致
- active 状态与当前实现保持一致

---

## 10. API 接入任务

## 10.1 项目列表接口

目标：获取当前用户可访问项目。

建议封装：

```ts
projectsApi.listMy(includeArchived?: boolean)
```

补充：该接口如能直接返回项目状态、更新时间、成员数/仓库数等轻量统计字段，前端可直接消费；否则本期仅展示基础字段。

### 10.2 项目详情接口

目标：获取单个项目的基础信息。

建议封装：

```ts
projectsApi.get(id: string)
```

### 10.3 项目成员接口

目标：获取成员列表。

建议封装：

```ts
projectsApi.listMembers(id: string)
```

### 10.4 项目邀请接口

目标：支持邀请成员并查看邀请结果。

建议封装：

```ts
projectsApi.listInvitations(id: string)
projectsApi.inviteMember(id: string, payload: {
  inviteeId: string
  inviteeUsername?: string
  role: "admin" | "member"
})
```

要求：

- 邀请结果页/列表应能展示 `pending / accepted / rejected / expired` 等状态
- 邀请成功后应刷新邀请列表，而不是仅依赖 toast

### 10.5 项目仓库接口

目标：获取项目绑定仓库。

建议封装：

```ts
projectsApi.listRepositories(id: string)
projectsApi.bindRepository(id: string, payload: {
  gitRepoUrl: string
  displayName?: string
  source?: string
})
projectsApi.unbindRepository(id: string, repoBindingId: string)
```

要求：

- 详情页应支持查看当前已关联仓库
- 允许用户从项目详情页发起仓库关联
- 若本期仅开放关联、不开放解绑，应在 UI 与文档中明确说明

### 10.6 项目仓库活动接口

目标：获取成员-仓库活跃分布。

建议封装：

```ts
projectsApi.getRepoActivity(id: string, opts?: {
  days?: number
  includeInactive?: boolean
})
```

要求：

- 前端默认 `days = 7`
- 支持 7 / 30 / 90 切换
- 将接口响应 normalize 为 UI 友好结构
- API 层需要保留 HTTP 状态码语义（至少区分 403 / 404 / 5xx），不能仅抛出 message 字符串
- 页面层应基于状态码区分权限不足、项目不存在、普通请求失败，而不是统一回退为“空数据”

---

## 11. 状态管理与实现约束

结合当前项目编码风格，要求如下：

1. 页面状态优先使用 `createStore`
2. 避免拆出过度抽象的小 hook
3. 列表加载、错误、空态状态应显式建模
4. 优先沿用现有顶层页面写法
5. 文案必须进入 i18n
6. 页面布局与区块风格尽量向 store 首页靠拢，尤其是页面 header、统计卡片、section block、表格壳层

建议页面状态示例：

```ts
const [state, setState] = createStore({
  loading: false,
  error: "",
  project: null,
  members: [],
  invitations: [],
  repositories: [],
  activity: null,
  days: 7,
  onlyActiveMembers: false,
  onlyActiveRepos: false,
})
```

---

## 12. i18n 任务

至少需要新增以下 key：

### 导航

- `projects.nav.title`

### 项目列表

- `projects.list.title`
- `projects.list.description`
- `projects.list.loading`
- `projects.list.empty`
- `projects.list.archived`
- `projects.list.active`

### 项目详情

- `projects.detail.title`
- `projects.detail.members`
- `projects.detail.invitations`
- `projects.detail.inviteMember`
- `projects.detail.invitationStatus`
- `projects.detail.repositories`
- `projects.detail.bindRepository`
- `projects.detail.activity`
- `projects.detail.noRepositories`
- `projects.detail.noActivity`

### 成员仓库活动

- `projects.activity.title`
- `projects.activity.summary.members`
- `projects.activity.summary.repositories`
- `projects.activity.summary.activeMembers`
- `projects.activity.summary.activeRepositories`
- `projects.activity.summary.totalRequests`
- `projects.activity.filter.onlyActiveMembers`
- `projects.activity.filter.onlyActiveRepositories`
- `projects.activity.range.7d`
- `projects.activity.range.30d`
- `projects.activity.range.90d`

### 错误与提示

- `projects.toast.loadFailed`
- `projects.toast.inviteSuccess`
- `projects.toast.inviteFailed`
- `projects.toast.bindRepositorySuccess`
- `projects.toast.bindRepositoryFailed`
- `projects.toast.retry`
- `projects.permissionDenied`

要求同步补充：

- `src/i18n/zh.ts`
- `src/i18n/en.ts`

补充说明：

- 当前项目存在多语言文件，但本期至少需要保证 `en.ts` 与 `zh.ts` 完整可用
- 如项目要求所有 locale key 对齐，应在后续统一补齐其他语言，或采用明确的英文回退策略
- 页面中不得散落硬编码中文/英文文案

---

## 13. 推荐实施步骤

### Phase 1：补齐路由与导航

任务：

1. 新增项目列表页路由
2. 新增项目详情页路由
3. 在顶层导航增加 `Projects`
4. 补齐最小 i18n 文案
5. 页面基础布局风格向 store 首页靠拢

交付结果：

- 能从顶层导航进入项目列表页
- 能跳转到项目详情页占位页面

### Phase 2：实现项目 API 封装

任务：

1. 封装项目列表 API
2. 封装项目详情 API
3. 封装项目成员 API
4. 封装项目邀请 API
5. 封装项目仓库 API
6. 封装项目 repo activity API

交付结果：

- 前端可以独立调用项目域接口
- 响应数据完成 normalize

### Phase 3：实现项目列表页

任务：

1. 加载当前用户项目
2. 实现项目卡片列表
3. 让页面结构尽量贴近 store 首页的 header + section + cards 表达
4. 处理登录态 / 空态 / 错误态
5. 点击项目进入详情

交付结果：

- 用户可浏览自己项目

### Phase 4：实现项目详情页

任务：

1. 展示项目信息
2. 展示成员列表
3. 支持邀请成员并展示邀请结果
4. 展示仓库列表并支持关联仓库
5. 实现活动区域框架（优先分块展示，不强制 tab）

交付结果：

- 用户可以在详情页看到项目核心结构信息

### Phase 5：实现成员仓库活动视图

任务：

1. 接入 `repo-activity` 接口
2. 渲染 summary 卡片
3. 渲染成员视角表格
4. 渲染仓库视角表格
5. 增加时间范围切换
6. 增加仅活跃筛选

交付结果：

- 用户能看见“哪个成员在哪些 repo 下活跃”

### Phase 6：联调与完善

任务：

1. 对齐后端字段命名
2. 校验空态和权限态
3. 完善 toast / retry / skeleton
4. 补充单元测试或最小 UI 行为测试

交付结果：

- 页面具备可交付质量

---

## 14. 验收标准

以下条件全部满足，视为本任务完成：

### 14.1 导航与路由

- 顶层导航中存在“项目管理 / Projects”入口
- 可以进入项目列表页
- 可以进入项目详情页
- 项目页整体布局风格与 store 首页保持明显一致性

### 14.2 项目列表

- 能正确显示当前用户项目列表
- 未登录时有登录引导
- 空列表时有明确空态
- 可从列表选择进入某个项目

### 14.3 项目详情

- 能显示项目基础信息
- 能显示成员列表
- 能邀请成员并查看邀请结果/邀请状态
- 能显示仓库列表
- 能从详情页发起关联仓库

### 14.4 成员仓库活动

- 默认显示最近 7 天数据
- 支持切换 30d / 90d
- 能展示 summary
- 能展示成员视角表格
- 能展示仓库视角表格
- 能在仓库列表上看到相关成员活跃度
- 正确区分“无仓库”和“无活动”

### 14.5 国际化

- 中文文案可用
- 英文文案可用
- 无硬编码中文/英文散落在页面中

### 14.6 稳定性

- 请求失败有可见提示
- 403 / 404 / 空数据场景可识别
- 页面不因局部接口失败而整体崩溃

---

## 15. 风险与注意事项

### 15.1 后端接口尚未完全落地

风险：项目相关接口可能仍处于设计阶段。

应对建议：

- 前端先定义稳定的 normalize 层
- 页面组件依赖前端内部类型，不强耦合原始响应
- 若后端未完成，可先用占位 mock 数据开发 UI，但最终需切回真实接口

### 15.1.1 项目管理能力可能分阶段交付

风险：成员邀请、邀请结果查询、仓库关联等接口可能与项目基础查询接口并不同步上线。

应对建议：

- UI 分区设计时保持各模块相对独立
- 即使邀请/关联仓库能力暂不可用，也不影响项目详情基础区和活动区展示
- 对尚未开放的操作使用明确的 disabled / placeholder / TODO 文案，而不是静默隐藏需求

### 15.2 活动接口字段较复杂

风险：`members` 与 `repositories` 双视角结构嵌套较深。

应对建议：

- 在 API 层做一次轻量 normalize
- 页面层只消费整理后的字段

### 15.4 API 错误语义不足

风险：若继续沿用仅抛出 message 的 fetch 包装方式，页面层将难以正确区分：

- 403 权限不足
- 404 项目不存在
- 5xx 或网络失败

应对建议：

- 项目域 API 单独封装错误对象或返回结构，至少保留 `status`
- 页面层基于状态码渲染权限态、未找到态与普通错误态
- 不要把 403 / 404 误处理成空列表或“暂无活动”

### 15.3 空态语义容易混淆

风险：

- 没有绑定仓库
- 已绑定仓库但没有活动

这两种状态在视觉上容易被误判为同一种。

应对建议：

- 页面文案明确区分
- summary 与列表区同时体现状态

---

## 16. 建议文件改动清单

以下为建议改动清单，具体文件名可根据实现再微调：

### 必改

- `packages/app-ai-native/src/routes.tsx`
- 顶层导航相关文件（按项目实际承载入口的位置确定）
- `packages/app-ai-native/src/i18n/zh.ts`
- `packages/app-ai-native/src/i18n/en.ts`

### 建议新增

- `packages/app-ai-native/src/pages/projects/pages/projects-home.tsx`
- `packages/app-ai-native/src/pages/projects/pages/project-detail.tsx`
- `packages/app-ai-native/src/pages/projects/components/project-invite-dialog.tsx`
- `packages/app-ai-native/src/pages/projects/components/project-invitations-table.tsx`
- `packages/app-ai-native/src/pages/projects/components/project-bind-repository-dialog.tsx`
- `packages/app-ai-native/src/pages/projects/lib/project-api.ts`

### 可选新增（按首版复杂度决定）

- `packages/app-ai-native/src/pages/projects/components/project-card.tsx`
- `packages/app-ai-native/src/pages/projects/components/project-summary-cards.tsx`
- `packages/app-ai-native/src/pages/projects/components/project-range-switch.tsx`
- `packages/app-ai-native/src/pages/projects/lib/project-types.ts`

说明：成员/仓库/activity 表格组件不要求在第一版即全部拆分；可先内聚在详情页实现，在交互稳定后再抽离复用组件。

---

## 17. 总结

本任务说明书的核心目标，是把 `costrict-web` 中“项目管理 + 项目成员仓库活动”的后端设计，转化为 `app-ai-native` 可执行的前端实现任务。

最终交付应达到的效果是：

1. 用户可以从顶层导航进入项目面板
2. 用户可以查看项目详情
3. 用户可以直观看到“项目成员分别在哪些 git repo 下有活动”
4. 页面结构、风格、交互方式与现有顶层 `store` 页面保持一致

如果后续继续推进二期能力，可在本说明书基础上继续扩展：

- 项目创建/编辑
- 邀请成员
- 绑定/解绑项目仓库
- 项目活跃趋势图
- 项目成本分析

---

**建议文档类型：** 前端实施任务说明书  
**适用项目：** `@opencode-ai/app-ai-native`  
**关联提案：**

- `costrict-web/docs/proposals/PROJECT_MANAGEMENT_DESIGN.md`
- `costrict-web/docs/proposals/PROJECT_MEMBER_REPO_ACTIVITY_DESIGN.md`
