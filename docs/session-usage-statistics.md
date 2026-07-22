# Session Usage Statistics Design

Daily scanning of session records to collect per-session usage metrics including date, model, token counts, and workspace info.

## Data Source

All data lives in a single SQLite database at `<data_dir>/opencode.db`, managed by Drizzle ORM.

### Relevant Tables

| Table | Key Columns | Notes |
|---|---|---|
| `session` | `id`, `project_id`, `workspace_id`, `directory`, `time_created`, `time_updated` | One row per session |
| `message` | `id`, `session_id`, `time_created`, `data` (JSON) | One row per message (user or assistant) |
| `project` | `id`, `worktree`, `vcs`, `name` | One row per project; `worktree` is the local git root path |
| `workspace` | `id`, `project_id`, `branch`, `directory` | Optional workspace binding |

### Token Storage Granularity

Token data is stored **per assistant message**, not per session. Each assistant message's `data` JSON contains:

```jsonc
{
  "role": "assistant",
  "modelID": "claude-sonnet-4-20250514",
  "providerID": "anthropic",
  "cost": 0.05,
  "tokens": {
    "input": 1234,
    "output": 567,
    "reasoning": 89,
    "cache": { "read": 100, "write": 50 },
    "total": 2040
  },
  "time": { "created": 1719820800000, "completed": 1719820810000 }
}
```

A single session may contain multiple rounds of conversation, each producing its own assistant message with independent token counts. The same session may also switch models mid-conversation.

### git_repo_url

The database does **not** store the git remote URL directly. `project.worktree` holds the local filesystem path. The remote URL must be resolved at scan time:

```bash
git -C <worktree> remote get-url origin
```

## Target Output Fields

| Field | Source | Aggregation |
|---|---|---|
| `session_id` | `session.id` | - |
| `date` | `session.time_created` (epoch ms) | - |
| `updated` | `session.time_updated` (epoch ms) | - |
| `model_id` | `message.data -> $.modelID` | GROUP BY when aggregating |
| `provider_id` | `message.data -> $.providerID` | GROUP BY when aggregating |
| `input_tokens` | `message.data -> $.tokens.input` | SUM per session+model |
| `output_tokens` | `message.data -> $.tokens.output` | SUM per session+model |
| `reasoning_tokens` | `message.data -> $.tokens.reasoning` | SUM per session+model |
| `cache_read_tokens` | `message.data -> $.tokens.cache.read` | SUM per session+model |
| `cache_write_tokens` | `message.data -> $.tokens.cache.write` | SUM per session+model |
| `cost` | `message.data -> $.cost` | SUM per session+model |
| `rounds` | COUNT of assistant messages | COUNT per session+model |
| `git_worktree` | `project.worktree` | - |
| `git_repo_url` | runtime `git remote get-url origin` | - |

## SQL Queries

### Aggregated per Session (daily scan)

```sql
SELECT
  s.id                                            AS session_id,
  date(s.time_created / 1000, 'unixepoch', 'localtime')  AS date,
  date(s.time_updated / 1000, 'unixepoch', 'localtime')  AS updated,
  p.worktree                                      AS git_worktree,
  json_extract(m.data, '$.modelID')               AS model_id,
  json_extract(m.data, '$.providerID')            AS provider_id,
  SUM(json_extract(m.data, '$.tokens.input'))     AS input_tokens,
  SUM(json_extract(m.data, '$.tokens.output'))    AS output_tokens,
  SUM(json_extract(m.data, '$.tokens.reasoning')) AS reasoning_tokens,
  SUM(json_extract(m.data, '$.tokens.cache.read'))  AS cache_read_tokens,
  SUM(json_extract(m.data, '$.tokens.cache.write')) AS cache_write_tokens,
  SUM(json_extract(m.data, '$.cost'))             AS total_cost,
  COUNT(*)                                        AS rounds
FROM session s
JOIN project p ON s.project_id = p.id
JOIN message m ON m.session_id = s.id
WHERE json_extract(m.data, '$.role') = 'assistant'
  AND s.time_updated >= strftime('%s', 'now', 'start of day') * 1000
GROUP BY s.id, json_extract(m.data, '$.modelID')
ORDER BY s.time_updated DESC;
```

### Per-round Detail

```sql
SELECT
  s.id                                                    AS session_id,
  datetime(m.time_created / 1000, 'unixepoch', 'localtime') AS round_time,
  p.worktree                                              AS git_worktree,
  json_extract(m.data, '$.modelID')                       AS model_id,
  json_extract(m.data, '$.providerID')                    AS provider_id,
  json_extract(m.data, '$.tokens.input')                  AS input_tokens,
  json_extract(m.data, '$.tokens.output')                 AS output_tokens,
  json_extract(m.data, '$.tokens.reasoning')              AS reasoning_tokens,
  json_extract(m.data, '$.tokens.cache.read')             AS cache_read_tokens,
  json_extract(m.data, '$.tokens.cache.write')            AS cache_write_tokens,
  json_extract(m.data, '$.cost')                          AS cost
FROM session s
JOIN project p ON s.project_id = p.id
JOIN message m ON m.session_id = s.id
WHERE json_extract(m.data, '$.role') = 'assistant'
  AND m.time_created >= strftime('%s', 'now', 'start of day') * 1000
ORDER BY m.time_created DESC;
```

## Implementation Notes

1. **Model switching**: A single session may use multiple models. The queries above GROUP BY `modelID` to separate them.
2. **Timestamps**: All `time_*` columns store epoch milliseconds (not seconds).
3. **git_repo_url resolution**: Build a `worktree -> remote_url` cache at scan start to avoid repeated `git` calls.
4. **Scheduling**: Run via cron / scheduled task at end of day. Filter by `time_updated >= start of day` to capture only today's activity.
5. **Reference implementation**: The project's built-in `stats` command (`src/cli/cmd/stats.ts`) already reads and aggregates token data from messages — use it as a reference.

## Schema References

| File | Lines | Description |
|---|---|---|
| `src/session/session.sql.ts` | 14-44 | session table |
| `src/session/session.sql.ts` | 46-58 | message table |
| `src/session/session.sql.ts` | 60-76 | part table |
| `src/session/message-v2.ts` | 399-447 | Assistant message schema (tokens, cost, modelID) |
| `src/session/message-v2.ts` | 249-267 | StepFinishPart (per-step tokens) |
| `src/session/index.ts` | 822-898 | getUsage calculation |
| `src/project/project.sql.ts` | 5-16 | project table (worktree, vcs) |
| `src/control-plane/workspace.sql.ts` | 6-17 | workspace table |
| `src/cli/cmd/stats.ts` | 95-307 | Built-in stats aggregation reference |
| `src/storage/db.ts` | 30-37 | Database file path and init |
