# 云端 SSE 推送架构设计文档

## 📋 目录

- [概述](#概述)
- [架构设计](#架构设计)
- [核心组件](#核心组件)
- [连接管理](#连接管理)
- [事件路由](#事件路由)
- [性能优化](#性能优化)
- [部署方案](#部署方案)
- [监控运维](#监控运维)
- [附录](#附录)

---

## 概述

### 背景

CoStrict 平台需要支持云端多设备、多会话的实时通信。用户通过 Console App 操作多个设备上的多个会话，需要实时同步执行状态、消息更新、文件变更等事件。

### 目标

1. **最小化连接数** - 避免连接数爆炸导致的性能问题
2. **精确事件路由** - 确保事件只推送给相关用户
3. **高可用性** - 支持自动重连、心跳检测
4. **可扩展性** - 支持大规模用户和设备接入
5. **低延迟** - 事件实时推送，延迟 < 100ms

### 核心挑战

| 挑战 | 描述 | 解决方案 |
|------|------|---------|
| 连接数爆炸 | 10 设备 × 5 会话 = 50+ 连接 | 连接复用：每设备 1 连接 |
| 内存占用高 | 每连接 ~10KB | 自动清理不活跃连接 |
| CPU 开销大 | 心跳、事件分发 | 批处理 + 按需订阅 |
| 事件路由复杂 | 多用户多设备多会话 | 基于会话订阅的精确路由 |

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                  Console App (1 用户)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1 个 SSE 连接到云端服务器                         │  │
│  │  GET /cloud/workspace/:workspaceID/event              │  │
│  │  - 订阅活跃会话的事件                              │  │
│  │  - 接收设备执行状态的实时更新                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ SSE (1 连接)
┌─────────────────────────────────────────────────────────────┐
│              云端服务器 (Console Core)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  连接管理器 (ConnectionManager)                    │  │
│  │  - userConnections: Map<userID, SSEConnection>     │  │
│  │  - deviceConnections: Map<deviceID, SSEConnection>  │  │
│  │  - sessionSubscriptions: Map<sessionID, userID[]>    │  │
│  │  - 连接超时检测（60 秒）                          │  │
│  │  - 心跳保活（30 秒）                               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  事件路由器 (EventRouter)                        │  │
│  │  - routeEvent(event: Event)                       │  │
│  │  - 查找订阅该事件的用户                           │  │
│  │  - 批量推送到用户连接                             │  │
│  │  - 事件批处理（16ms）                              │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  API 端点 (CloudRoutes)                         │  │
│  │  - GET /cloud/workspace/:workspaceID/event        │  │
│  │  - GET /cloud/device/:deviceID/event             │  │
│  │  - POST /cloud/session/:sessionID/subscribe       │  │
│  │  - POST /cloud/session/:sessionID/unsubscribe     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ SSE (N 连接，每设备 1 个)
┌─────────────────────────────────────────────────────────────┐
│                  设备端 (N 个设备)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ 设备1    │ │ 设备2    │ │ 设备N    │             │
│  │ - SSE连接 │ │ - SSE连接 │ │ - SSE连接 │             │
│  │ - 事件转发│ │ - 事件转发│ │ - 事件转发│             │
│  │ - 执行会话│ │ - 执行会话│ │ - 执行会话│             │
│  └──────────┘ └──────────┘ └──────────┘             │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

#### **1. 用户订阅会话事件**

```
Console App                      云端服务器
    │                                 │
    │  POST /cloud/session/:id/subscribe
    │  { sessionID, userID }
    │────────────────────────────────────>│
    │                                 │ ConnectionManager
    │                                 │ .subscribeToSession()
    │                                 │
    │  { success: true }              │
    │<────────────────────────────────────│
    │                                 │
```

#### **2. 设备执行会话并推送事件**

```
设备端                           云端服务器                    Console App
    │                                 │                          │
    │  Session.execute()               │                          │
    │  Bus.publish(Event.Updated)    │                          │
    │                                 │                          │
    │  POST /cloud/event              │                          │
    │  { deviceID, event }           │                          │
    │────────────────────────────────────>│                          │
    │                                 │ EventRouter.routeEvent()   │
    │                                 │ - 查找订阅用户           │
    │                                 │                          │
    │                                 │ SSE 推送事件              │
    │                                 │─────────────────────────>│
    │                                 │                          │
    │                                 │                          │ UI 更新
```

#### **3. 多设备并发执行**

```
设备1     设备2     设备3           云端服务器              Console App
  │         │         │                  │                      │
  │ 执行会话A │         │                  │                      │
  ├─────────>│         │                  │                      │
  │         │         │                  │                      │
  │         │ 执行会话B │                  │                      │
  │         ├─────────>│                  │                      │
  │         │         │                  │                      │
  │         │         │ 执行会话C        │                      │
  │         │         ├────────────────>│                      │
  │         │         │                  │                      │
  │         │         │                  │ 批量推送事件          │
  │         │         │                  ├──────────────────────>│
  │         │         │                  │                      │
  │         │         │                  │                      │ 并发更新 UI
  │         │         │                  │                      │
```

---

## 核心组件

### 1. 连接管理器 (ConnectionManager)

**职责：**
- 管理所有 SSE 连接（用户连接 + 设备连接）
- 维护连接索引（用户连接 Map、设备连接 Map）
- 管理会话订阅关系
- 连接超时检测和清理
- 心跳保活

**数据结构：**

```typescript
type SSEConnection = {
  id: string                    // 连接唯一标识
  type: "user" | "device"     // 连接类型
  userID: string               // 用户 ID
  deviceID?: string           // 设备 ID（仅设备连接）
  workspaceID: string         // 工作空间 ID
  send: (event: any) => void // 发送事件方法
  close: () => void          // 关闭连接方法
  lastActivity: number       // 最后活动时间
}

// 连接索引
connections: Map<string, SSEConnection>           // 所有连接
userConnections: Map<string, Set<string>>        // userID -> connectionIDs
deviceConnections: Map<string, string>         // deviceID -> connectionID
sessionSubscriptions: Map<string, Set<string>> // sessionID -> userConnectionIDs
```

**核心方法：**

| 方法 | 描述 |
|------|------|
| `registerUserConnection(conn)` | 注册用户 SSE 连接 |
| `registerDeviceConnection(conn)` | 注册设备 SSE 连接 |
| `subscribeToSession(sessionID, userID)` | 用户订阅会话事件 |
| `unsubscribeFromSession(sessionID, userID)` | 用户取消订阅会话 |
| `closeConnection(connectionID)` | 关闭连接并清理索引 |
| `routeEvent(event)` | 路由事件到目标连接 |
| `getStats()` | 获取连接统计信息 |

### 2. 事件路由器 (EventRouter)

**职责：**
- 接收来自设备的事件
- 根据事件类型确定目标用户
- 批量推送事件到用户连接
- 事件过滤和去重

**路由规则：**

| 事件类型 | 目标 | 路由逻辑 |
|---------|------|---------|
| `session.status` | 订阅该会话的用户 | 查找 `sessionSubscriptions[sessionID]` |
| `message.*` | 订阅该会话的用户 | 查找 `sessionSubscriptions[sessionID]` |
| `device.status` | 该设备的所有者 | 查找 `deviceConnections[deviceID]` → `userConnections` |
| `device.*` | 该设备的所有者 | 查找 `deviceConnections[deviceID]` → `userConnections` |

**批处理机制：**

```typescript
// 事件队列
eventQueue: Map<connectionID, Event[]>

// 批处理间隔
FLUSH_INTERVAL_MS = 16

// 批量发送
setInterval(() => {
  for (const [connID, events] of eventQueue) {
    const conn = connections.get(connID)
    conn.send({
      type: "batch",
      properties: { events }
    })
  }
  eventQueue.clear()
}, FLUSH_INTERVAL_MS)
```

### 3. 设备端事件转发器 (EventForwarder)

**职责：**
- 订阅本地 Bus 事件
- 转发事件到云端
- 监听云端事件（接收来自 Console App 的命令）

**转发流程：**

```
本地 Bus 事件
    │
    ├─> EventForwarder.forwardEventToCloud()
    │       │
    │       ├─> POST /cloud/event
    │       │   { deviceID, event }
    │       │
    │       └─> 云端接收并路由
    │
    └─> 云端事件
            │
            ├─> SSE 接收
            │
            └─> handleCloudEvent()
                    │
                    ├─> session.abort
                    ├─> session.message
                    └─> 执行相应操作
```

### 4. Console App 扩展

**扩展点：**

1. **ServerConnection 类型扩展**
   ```typescript
   type Cloud = {
     type: "cloud"
     http: HttpBase
     workspaceID: string
   }
   ```

2. **GlobalSDK 事件 URL 扩展**
   ```typescript
   const eventUrl = server.current?.type === "cloud"
     ? `${server.current.http.url}/api/cloud/workspace/${server.current.workspaceID}/event`
     : `${server.current.http.url}/global/event`
   ```

3. **会话订阅管理**
   ```typescript
   // 打开会话时订阅
   ConnectionManager.subscribeToSession(sessionID, userID)

   // 关闭会话时取消订阅
   ConnectionManager.unsubscribeFromSession(sessionID, userID)
   ```

---

## 连接管理

### 连接生命周期

```
建立连接
    │
    ├─> 验证认证信息
    ├─> 注册到 ConnectionManager
    ├─> 发送连接确认事件
    │   { type: "cloud.connected", ... }
    │
    └─> 启动心跳检测
            │
            ├─> 每 30 秒发送心跳
            │   { type: "heartbeat", timestamp }
            │
            ├─> 更新 lastActivity
            │
            └─> 检测超时（60 秒）
                    │
                    ├─> 超时 → 关闭连接
                    └─> 清理索引
```

### 连接复用策略

**原则：每个设备 1 个 SSE 连接**

```
设备端：
┌─────────────────────────────────────────────┐
│  1 个 SSE 连接                          │
│  ├─> 会话 A 事件                         │
│  ├─> 会话 B 事件                         │
│  ├─> 会话 C 事件                         │
│  └─> 所有事件通过同一个连接推送             │
└─────────────────────────────────────────────┘
```

**优势：**
- 连接数从 `N 设备 × M 会话` 降至 `N 设备`
- 减少内存和 CPU 开销
- 简化连接管理

### 连接限制

**防止连接数爆炸：**

| 限制类型 | 限制值 | 说明 |
|---------|--------|------|
| 单用户最大连接数 | 5 | 防止单用户打开多个浏览器标签 |
| 单设备最大连接数 | 1 | 强制连接复用 |
| 单用户最大订阅会话数 | 50 | 防止订阅过多会话 |

**实现：**

```typescript
function registerUserConnection(conn): string | null {
  const existing = userConnections.get(conn.userID)
  if (existing && existing.size >= MAX_CONNECTIONS_PER_USER) {
    return null // 拒绝连接
  }
  // ... 注册逻辑
}
```

### 自动清理机制

**1. 连接超时清理**
```typescript
// 每 10 秒检查一次
setInterval(() => {
  const now = Date.now()
  for (const [id, conn] of connections) {
    if (now - conn.lastActivity > CONNECTION_TIMEOUT_MS) {
      closeConnection(id)
    }
  }
}, 10_000)
```

**2. 会话订阅清理**
```typescript
// 每分钟检查一次
setInterval(() => {
  const now = Date.now()
  for (const [sessionID, connIDs] of sessionSubscriptions) {
    const lastActivity = sessionActivity.get(sessionID)
    if (lastActivity && now - lastActivity > 5 * 60 * 1000) {
      sessionSubscriptions.delete(sessionID)
    }
  }
}, 60_000)
```

---

## 事件路由

### 事件类型

| 事件类型 | 方向 | 用途 | 路由目标 |
|---------|------|------|---------|
| `cloud.connected` | 云端→用户 | 连接确认 | 发送连接的用户 |
| `device.connected` | 云端→设备 | 连接确认 | 发送连接的设备 |
| `heartbeat` | 双向 | 心跳保活 | 发送连接方 |
| `session.status` | 设备→云端→用户 | 会话状态更新 | 订阅该会话的用户 |
| `session.created` | 设备→云端→用户 | 会话创建 | 订阅该会话的用户 |
| `session.updated` | 设备→云端→用户 | 会话信息更新 | 订阅该会话的用户 |
| `message.part.updated` | 设备→云端→用户 | 消息部分更新 | 订阅该会话的用户 |
| `message.part.delta` | 设备→云端→用户 | 消息增量更新 | 订阅该会话的用户 |
| `device.status` | 设备→云端→用户 | 设备状态更新 | 该设备的所有者 |
| `session.abort` | 用户→云端→设备 | 中止会话 | 执行该会话的设备 |
| `session.message` | 用户→云端→设备 | 发送消息 | 执行该会话的设备 |

### 路由流程

```
事件到达 EventRouter
    │
    ├─> 解析事件类型和属性
    │
    ├─> 确定目标连接
    │   │
    │   ├─> session.* 事件
    │   │   └─> 查找 sessionSubscriptions[sessionID]
    │   │
    │   ├─> device.* 事件
    │   │   └─> 查找 deviceConnections[deviceID] → userConnections
    │   │
    │   └─> 其他事件
    │       └─> 根据具体逻辑路由
    │
    ├─> 添加到事件队列
    │   eventQueue[connID].push(event)
    │
    └─> 批量推送（16ms 后）
            │
            ├─> 遍历 eventQueue
            ├─> 批量发送到目标连接
            └─> 清空队列
```

### 事件过滤

**1. 过期 Delta 事件过滤**

```typescript
// 标记过期的 delta
staleDeltas: Set<string> = new Set()

// 如果收到 message.part.updated，标记相关 delta 为过期
if (event.type === "message.part.updated") {
  const key = `${sessionID}:${messageID}:${partID}`
  staleDeltas.add(key)
}

// 推送时跳过过期的 delta
if (event.type === "message.part.delta") {
  const key = `${sessionID}:${messageID}:${partID}`
  if (staleDeltas.has(key)) {
    continue // 跳过
  }
}
```

**2. 事件合并**

```typescript
// 相同 key 的事件会被合并
coalesced: Map<string, number> = new Map()

const k = key(event.directory, event.payload)
const i = coalesced.get(k)

if (i !== undefined) {
  queue[i] = { directory, payload } // 覆盖之前的事件
  continue
}

coalesced.set(k, queue.length)
queue.push({ directory, payload })
```

---

## 性能优化

### 连接数优化

**优化前后对比：**

```
场景：100 用户 × 10 设备 × 5 会话

优化前：
- 用户连接：100
- 设备连接：1000
- 会话连接：5000
- 总计：6100 个 SSE 连接

优化后：
- 用户连接：100
- 设备连接：1000
- 会话连接：0（复用设备连接）
- 总计：1100 个 SSE 连接

减少：82%
```

### 内存优化

**优化策略：**

1. **连接复用** - 减少 82% 连接数
2. **自动清理** - 定期清理不活跃连接
3. **订阅限制** - 限制单用户订阅会话数
4. **事件批处理** - 减少事件对象创建

**内存占用预估：**

```
每个 SSE 连接：~10KB

优化前：6100 × 10KB = 61MB
优化后：1100 × 10KB = 11MB

减少：50MB (82%)
```

### CPU 优化

**优化策略：**

1. **批处理** - 16ms 批量推送，减少函数调用
2. **事件合并** - 相同事件只处理一次
3. **按需订阅** - 只订阅活跃会话
4. **心跳优化** - 30 秒心跳，减少网络开销

**CPU 开销预估：**

```
心跳频率：30 秒/次

优化前：6100 / 30 = 203 次/秒
优化后：1100 / 30 = 37 次/秒

减少：82%
```

### 网络优化

**优化策略：**

1. **事件批处理** - 减少网络往返
2. **增量更新** - 只发送变化的数据
3. **压缩传输** - 启用 gzip 压缩
4. **CDN 加速** - 静态资源使用 CDN

**网络流量预估：**

```
平均事件大小：1KB

优化前：1000 事件/秒 × 1KB = 1MB/s
优化后：200 事件/秒 × 1KB = 200KB/s

减少：80%
```

---

## 部署方案

### 架构部署

```
┌─────────────────────────────────────────────────────────────┐
│                    负载均衡器 (LB)                      │
│  - 分发用户连接到多个云端服务器实例                     │
│  - 支持 WebSocket 和 SSE 协议                           │
└─────────────────────────────────────────────────────────────┘
                            ↕
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ 云端服务器 1    │   │ 云端服务器 2    │   │ 云端服务器 N    │
│ - ConnectionManager │   │ - ConnectionManager │   │ - ConnectionManager │
│ - EventRouter   │   │ - EventRouter   │   │ - EventRouter   │
│ - API 端点      │   │ - API 端点      │   │ - API 端点      │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ↕
                    ┌───────────────┐
                    │   Redis 集群  │
                    │ - 连接状态缓存  │
                    │ - 会话订阅缓存  │
                    │ - 事件队列      │
                    └───────────────┘
```

### 水平扩展

**扩展策略：**

1. **无状态设计** - ConnectionManager 不存储持久化状态
2. **共享存储** - 使用 Redis 共享连接状态和会话订阅
3. **事件广播** - Redis Pub/Sub 跨服务器广播事件

**Redis 数据结构：**

```redis
# 连接状态
HSET connections:{userID} {connectionID} {connectionData}
HSET connections:{deviceID} {connectionID} {connectionData}

# 会话订阅
SADD subscriptions:{sessionID} {userID}

# 事件队列
LPUSH events:{sessionID} {event}
```

### 容灾备份

**备份策略：**

1. **多可用区部署** - 跨 AZ 部署，避免单点故障
2. **自动故障转移** - LB 自动剔除不健康实例
3. **数据持久化** - Redis AOF 持久化
4. **定期备份** - 每日备份数据库和 Redis

---

## 监控运维

### 监控指标

**连接监控：**

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| 总连接数 | 当前活跃连接数 | > 10,000 |
| 用户连接数 | 用户 SSE 连接数 | > 5,000 |
| 设备连接数 | 设备 SSE 连接数 | > 5,000 |
| 会话订阅数 | 活跃会话订阅数 | > 10,000 |
| 连接失败率 | 连接失败次数 / 总连接数 | > 5% |
| 平均连接时长 | 连接平均存活时间 | < 60 秒 |

**事件监控：**

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| 事件吞吐量 | 每秒处理事件数 | > 10,000 |
| 事件延迟 | 事件从产生到推送的延迟 | > 500ms |
| 事件丢失率 | 丢失事件数 / 总事件数 | > 1% |
| 批处理队列长度 | 待处理事件队列长度 | > 1,000 |

**性能监控：**

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| CPU 使用率 | 服务器 CPU 使用率 | > 80% |
| 内存使用率 | 服务器内存使用率 | > 85% |
| 网络带宽 | 网络出站带宽 | > 1Gbps |
| Redis 连接数 | Redis 连接数 | > 10,000 |

### 日志记录

**关键日志：**

```typescript
// 连接建立
[ConnectionManager] User connected: {userID} ({connectionID})
[ConnectionManager] Device connected: {deviceID} ({connectionID})

// 连接关闭
[ConnectionManager] Connection closed: {connectionID}
[ConnectionManager] Timeout: {connectionID}

// 事件路由
[ConnectionManager] Routed event {type} to {count} connections
[EventRouter] Event {type} queued for {sessionID}

// 错误日志
[ConnectionManager] Failed to send to {connectionID}: {error}
[EventRouter] Invalid event: {event}
```

### 告警规则

```yaml
# 连接数告警
- alert: HighConnectionCount
  expr: connection_count_total > 10000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "连接数超过阈值"

# 事件延迟告警
- alert: HighEventLatency
  expr: event_latency_p99 > 500ms
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "事件延迟过高"

# CPU 使用率告警
- alert: HighCPUUsage
  expr: cpu_usage_percent > 80
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "CPU 使用率过高"
```

---

## 附录

### 性能基准

**测试环境：**
- 服务器：8 CPU, 16GB RAM
- 网络：1Gbps
- 数据库：MySQL 8.0
- 缓存：Redis 7.0

**测试场景：**

| 场景 | 用户数 | 设备数 | 会话数 | 连接数 | CPU | 内存 | 事件延迟 |
|------|--------|--------|--------|--------|-----|------|---------|
| 小规模 | 10 | 50 | 250 | 60 | 5% | 1GB | 20ms |
| 中规模 | 100 | 500 | 2500 | 600 | 25% | 5GB | 50ms |
| 大规模 | 1000 | 5000 | 25000 | 6000 | 70% | 12GB | 100ms |

### 故障排查

**常见问题：**

1. **连接频繁断开**
   - 检查网络稳定性
   - 检查心跳超时设置
   - 检查服务器负载

2. **事件延迟高**
   - 检查事件队列积压
   - 检查批处理间隔
   - 检查网络带宽

3. **内存占用高**
   - 检查连接数是否正常
   - 检查是否有内存泄漏
   - 检查自动清理是否生效

### API 参考

**SSE 端点：**

```
GET /cloud/workspace/:workspaceID/event
  - 订阅工作空间事件
  - 返回：SSE 流

GET /cloud/device/:deviceID/event
  - 订阅设备事件
  - 返回：SSE 流

POST /cloud/session/:sessionID/subscribe
  - 订阅会话事件
  - 请求：{ sessionID, userID }
  - 返回：{ success: true }

POST /cloud/session/:sessionID/unsubscribe
  - 取消订阅会话事件
  - 请求：{ sessionID, userID }
  - 返回：{ success: true }

POST /cloud/event
  - 设备推送事件到云端
  - 请求：{ deviceID, event }
  - 返回：{ success: true }

GET /cloud/stats
  - 获取连接统计
  - 返回：{ totalConnections, userConnections, deviceConnections, sessionSubscriptions }
```

### 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2025-03-09 | 初始版本 |

---

**文档版本：** 1.0.0
**最后更新：** 2025-03-09
**维护者：** CoStrict Team
