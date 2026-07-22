# OpenCode 配置兼容性支持

## 概述

CoStrict 现在支持兼容 OpenCode 的配置文件，允许用户在迁移到 CoStrict 时继续使用原有的 OpenCode 配置。

## 功能特性

- ✅ 支持 `COSTRICT_ENABLE_OPENCODE_CONFIG` 环境变量来启用/禁用 OpenCode 配置兼容性
- ✅ 当启用时，同时加载 OpenCode 和 CoStrict 配置
- ✅ CoStrict 配置优先级高于 OpenCode 配置（同名配置项会被 CoStrict 覆盖）
- ✅ 支持多种 OpenCode 配置文件路径和格式

## 环境变量

| 环境变量 | 类型 | 默认值 | 说明 |
|---------|------|--------|------|
| `COSTRICT_ENABLE_OPENCODE_CONFIG` | boolean | `false` | 是否启用 OpenCode 配置兼容性 |
| `OPENCODE_CONFIG` | string | - | OpenCode 自定义配置文件路径 |
| `OPENCODE_CONFIG_CONTENT` | string | - | OpenCode 内联配置内容（JSON 字符串） |
| `OPENCODE_CONFIG_DIR` | string | - | OpenCode 配置目录路径 |

## 配置文件加载顺序（从低到高优先级）

### 1. Remote/well-known 配置
`*.well-known/opencode`

### 2. OpenCode 全局配置
- `~/.config/config.json`
- `~/.config/opencode.json`
- `~/.config/opencode.jsonc`
- `~/.config/opencode/opencode.json` ⭐ 新增
- `~/.config/opencode/opencode.jsonc` ⭐ 新增
- `~/.config/opencode/config` (TOML 格式)

### 3. OpenCode 自定义配置
- `OPENCODE_CONFIG` 指定的文件路径

### 4. OpenCode 项目配置
- 当前项目目录的 `opencode.jsonc`
- 当前项目目录的 `opencode.json`
- 项目 `.opencode/` 目录

### 5. CoStrict 全局配置
- `~/.config/costrict.json`
- `~/.config/costrict.jsonc`

### 6. CoStrict 自定义配置
- `COSTRICT_CONFIG` 指定的文件路径

### 7. CoStrict 项目配置
- 当前项目目录的 `costrict.jsonc`
- 当前项目目录的 `costrict.json`
- 项目 `.costrict/` 目录

### 8. 内联配置（最高优先级）
- `COSTRICT_CONFIG_CONTENT`

## 配置合并规则

### 对象字段
CoStrict 配置会覆盖 OpenCode 配置的同名字段。

```json
// OpenCode 配置
{
  "model": "openai/gpt-4",
  "theme": "dark",
  "username": "user1"
}

// CoStrict 配置
{
  "model": "anthropic/claude-3",
  "username": "user2"
}

// 合并结果
{
  "model": "anthropic/claude-3",   // 被 CoStrict 覆盖
  "theme": "dark",                 // 保留 OpenCode 值
  "username": "user2"               // 被 CoStrict 覆盖
}
```

### 数组字段
数组字段会被合并并去重。

```json
// OpenCode 配置
{
  "plugin": ["plugin1", "plugin2"]
}

// CoStrict 配置
{
  "plugin": ["plugin2", "plugin3"]
}

// 合并结果
{
  "plugin": ["plugin1", "plugin2", "plugin3"]  // 合并并去重
}
```

## 使用示例

### 基本使用

默认情况下，OpenCode 配置兼容性是启用的，系统会自动加载所有支持的配置文件：

```bash
# 不需要任何额外配置，直接启动
costrict
```

### 禁用 OpenCode 配置兼容性

如果你想完全使用 CoStrict 配置系统：

```bash
# 方法 1: 设置环境变量为 false
export COSTRICT_ENABLE_OPENCODE_CONFIG=false
costrict

# 方法 2: 设置环境变量为 0
export COSTRICT_ENABLE_OPENCODE_CONFIG=0
costrict
```

### 使用自定义 OpenCode 配置文件

```bash
# 指定自定义的 OpenCode 配置文件
export OPENCODE_CONFIG=/path/to/my-opencode-config.json
costrict
```

### 使用 OpenCode 配置目录

```bash
# 指定 OpenCode 配置目录
export OPENCODE_CONFIG_DIR=/path/to/my-opencode-config
costrict
```

### 覆盖特定配置

如果你想在大部分使用 OpenCode 配置的同时，覆盖某些设置：

```bash
# 创建 CoStrict 配置文件（优先级更高）
cat > ~/.config/costrict.json << 'EOF'
{
  "model": "anthropic/claude-3-5-sonnet",
  "username": "costrict-user"
}
EOF

# 启动 CoStrict（会加载两者配置，CoStrict 会覆盖 OpenCode 的同名字段）
costrict
```

## 支持的配置目录结构

### OpenCode 目录

```
~/.config/opencode/
├── opencode.json        # 主配置文件
├── opencode.jsonc       # 带注释的 JSON 配置
├── opencode.config      # TOML 格式配置
├── command/            # 命令定义
├── agent/              # Agent 定义
└── plugin/             # 插件文件
```

### 项目目录

```
my-project/
├── opencode.json          # 项目级 OpenCode 配置
├── opencode.jsonc         # 带注释的 JSON 格式
├── .opencode/             # OpenCode 配置目录（与 costrict/ 并列）
│   ├── command/
│   ├── agent/
│   └── plugin/
├── costrict.json          # 项目级 CoStrict 配置（会覆盖 opencode.json）
├── .costrict/            # CoStrict 配置目录（会覆盖 .opencode/）
│   ├── command/
│   ├── agent/
│   └── plugin/
```

## 配置示例

### OpenCode 配置示例

```json
// ~/.config/opencode/opencode.json
{
  "$schema": "https://costrict.ai/config.json",
  "model": "openai/gpt-4",
  "theme": "dark",
  "username": "opencode-user",
  "plugin": [
    "@opencode-ai/plugin-opencode"
  ],
  "mcp": {
    "test_opencode": {
      "type": "local",
      "command": "ls -lh",
      "args": []
    }
  }
}
```

### CoStrict 配置示例

```json
// ~/.config/costrict.json
{
  "$schema": "https://costrict.ai/config.json",
  "model": "anthropic/claude-3-5-sonnet",
  "username": "costrict-user",
  "plugin": [
    "@opencode-ai/plugin-opencode",
    "@custom/plugin-enhanced"
  ],
  "mcp": {
    "test1": {
      "type": "local",
      "command": "ls -lh",
      "args": []
    }
  }
}
```

## 迁移指南

### 从纯 OpenCode 迁移到 CoStrict

1. **保持现有配置**：
   - 无需迁移，OpenCode 配置文件可以继续使用
   - 系统会自动加载 OpenCode 配置

2. **逐步迁移**：
   - 创建 CoStrict 配置文件
   - 只将需要修改的配置项写入 CoStrict 配置
   - 其他配置保持使用 OpenCode

3. **完全迁移**：
   - 将所有配置迁移到 CoStrict 格式
   - 设置 `COSTRICT_ENABLE_OPENCODE_CONFIG=false`
   - 删除旧配置文件（可选）

### 配置文件检查

查看当前加载的配置：

```bash
# 查看完整的合并后配置
costrict .config cat

# 查看特定配置文件
costrict .config cat ~/.config/opencode/opencode.json
costrict .config cat ~/.config/costrict.json
```

## 故障排查

### OpenCode 配置未加载

**问题**：OpenCode 配置文件中的配置未生效

**检查清单**：
1. 确认 `COSTRICT_ENABLE_OPENCODE_CONFIG` 未设置为 `false`
2. 检查配置文件路径是否正确
3. 查看日志输出（启用 debug 模式）
4. 验证 CoStrict 配置中没有覆盖相同配置项

```bash
# 启用 debug 日志
export LOG_LEVEL=debug
costrict
```

### 配置冲突

**问题**：某些配置项不符合预期

**解决方案**：
1. 检查配置优先级，确认哪个配置文件生效
2. 使用 `.config cat` 查看合并后的配置
3. 根据 CoStrict 覆盖 OpenCode 的规则调整配置文件

### MCP 服务器无法连接

**问题**：OpenCode 配置的 MCP 服务器报错

**解决方案**：
1. 检查 OpenCode 配置文件格式是否正确
2. 验证 MCP 命令在当前系统上可用
3. 查看详细错误信息

```bash
# 查看详细错误
costrict --verbose
```

## 技术细节

### 配置合并函数

使用 `mergeConfigConcatArrays` 函数进行配置合并：

```typescript
function mergeConfigConcatArrays(target: Info, source: Info): Info {
  const merged = mergeDeep(target, source)
  
  // 数组字段使用 Set 去重和合并
  if (target.plugin && source.plugin) {
    merged.plugin = Array.from(new Set([...target.plugin, ...source.plugin]))
  }
  if (target.instructions && source.instructions) {
    merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]))
  }
  
  return merged
}
```

### 惰性加载

`opencodeGlobal` 和 `global` 函数使用惰性加载以提高性能：

```typescript
export const opencodeGlobal = lazy(async () => {
  // 加载 OpenCode 全局配置
})
```

## 相关文件

- [`config.ts`](./config.ts) - 配置加载和管理逻辑
- [`flag.ts`](../flag/flag.ts) - 环境变量定义
- [`opencode-config.test.ts`](./opencode-config.test.ts) - 测试用例

## 版本历史

### v1.0.0 (2025-01-27)
- ✅ 初始版本
- ✅ 添加 `COSTRICT_ENABLE_OPENCODE_CONFIG` 支持
- ✅ 实现双阶段配置加载（OpenCode + CoStrict）
- ✅ 支持 `~/.config/opencode/` 目录
- ✅ 支持 `~/.opencode/` 和 `opencode/` 目录扫描
- ✅ 实现配置合并和覆盖规则

## 代码实际行为（当前实现）

本节以 `src/config/config.ts`、`src/config/paths.ts`、`src/skill/index.ts`、`src/command/index.ts` 当前代码为准。

### 主配置文件读取顺序（低优先级 -> 高优先级）

1. 远端 `/.well-known/opencode`（若账号启用 wellknown auth）
2. 全局目录 `~/.config/costrict` 下：
   - `config.json`
   - `opencode.json`
   - `opencode.jsonc`
   - `costrict.json`
   - `costrict.jsonc`
3. `OPENCODE_CONFIG` 指定文件
4. 从当前目录向上到 worktree 根，查找：
   - `opencode.jsonc`、`opencode.json`
   - `costrict.jsonc`、`costrict.json`
5. 遍历配置目录集合（见下文“目录扫描顺序”），并在 `.opencode`/`OPENCODE_CONFIG_DIR` 目录额外读取：
   - `opencode.jsonc`
   - `opencode.json`
6. `OPENCODE_CONFIG_CONTENT`（内联 JSON）
7. 远端账户配置 `/api/config`（若已登录组织）
8. managed 配置目录（企业托管）中的：
   - `opencode.jsonc`
   - `opencode.json`

### 目录扫描顺序（用于 command/agent/skill/plugin）

按 `ConfigPaths.directories()` 顺序：

1. `~/.config/costrict`
2. 项目向上查找 `.opencode`
3. 项目向上查找 `.costrict`
4. `~/.opencode`
5. `~/.costrict`
6. `OPENCODE_CONFIG_DIR`（若设置）
7. `COSTRICT_CONFIG_DIR`（若设置）

后扫描的目录优先级更高（同名键会覆盖先前结果）。

### mcp 如何读取与覆盖

- 来源：主配置对象 `mcp` 字段（不来自 markdown 扫描）。
- 合并：按主配置读取顺序做深度合并；同名 server（同 key）以后者为准。
- 生效条件：
  - 条目需要带 `type`（`local` 或 `remote`）才会被 MCP runtime 连接。
  - `enabled: false` 会标记为 disabled，不连接。
  - 仅 `{ "enabled": false }` 这种简写可用于禁用已有项，但它本身不是可连接配置。

### agent 如何读取与覆盖

- 来源一：配置文件中的 `agent` 字段（对象）。
- 来源二：目录扫描 `agent/**/*.md` 或 `agents/**/*.md`（frontmatter + markdown body）。
- 来源三：`mode/*.md`/`modes/*.md` 会转成 `agent` 下的 primary agent。
- 覆盖规则：
  - 先载入基础配置，再按目录扫描顺序 `mergeDeep` 覆盖。
  - 同名 agent 后者覆盖前者（未提供的字段会保留）。

### command 如何读取与覆盖

- 来源一：配置文件中的 `command` 字段（对象）。
- 来源二：目录扫描 `command/**/*.md` 或 `commands/**/*.md`。
- 运行时命令总表合并顺序（低 -> 高）：
  - 内置命令（init/review/...）
  - learning/tdd 内置扩展命令
  - `cfg.command`
  - MCP prompts 映射命令
  - Skills 映射命令（仅在同名命令不存在时补充）
- 因此同名时：`cfg.command` 可覆盖内置；MCP prompt 可覆盖同名配置命令；skill 命令不会覆盖已有命令。

### skill 如何读取与覆盖

- 来源一：外部技能目录（若未禁用）：
  - `~/.costrict/skills/**/SKILL.md`
  - `~/.claude/skills/**/SKILL.md`
  - `~/.agents/skills/**/SKILL.md`
  - 项目向上查找到的 `.costrict`、`.claude`、`.agents` 下 `skills/**/SKILL.md`
- 来源二：配置目录集合中的 `skill/**/SKILL.md` 或 `skills/**/SKILL.md`
- 来源三：内置 CoStrict skills
- 来源四：`skills.paths` 指定目录下 `**/SKILL.md`
- 来源五：`skills.urls` 远程拉取后缓存目录下 `**/SKILL.md`
- 覆盖规则：
  - 以 skill `name` 作为唯一键；
  - 后加载的同名 skill 覆盖先加载的同名 skill（会记录 duplicate 警告）。

### 合并细则

- 普通对象字段：`mergeDeep`，后者覆盖前者同名字段。
- 数组字段：
  - `plugin` 和 `instructions`：拼接后去重。
  - 其他数组：按 `mergeDeep` 默认行为（通常后者替换）。

### 动态热更新

文件变更会触发配置失效重载（`Config.invalidate(true)`）：

- `(.costrict|.opencode)/(agent|agents|command|commands)/**/*.md`
- `(.costrict|.claude|.agents)/skills/**/SKILL.md`
- `(.opencode)/(skill|skills)/**/SKILL.md`
