# OpenCouncil API Reference

Base URL: `http://localhost:4311/api/v1`
All request bodies are JSON. Errors use `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
Zod validation returns `400 validation_error` with field paths. Malformed JSON,
unsupported media, and oversized bodies preserve HTTP 400, 415, and 413.
Unexpected server errors return a generic message; details stay in server logs.
Cross-origin browser requests receive `403 cross_origin_denied`. Use a same-origin
UI/proxy. When `OPEN_COUNCIL_OPERATOR_TOKEN` is set, all API routes except health and auth entrypoints require its bearer token or an HttpOnly browser session cookie.

## System

### GET /health

`200 { "ok": true, "version": string, "instanceId": string }` — `instanceId`
is stable for the lifetime of the server process.

### GET /system/health

Identical to `GET /health`. Both exist so health checks can point at either
path; neither touches the database.

### GET /system/info

`200 { "version", "instanceId", "uptimeSeconds", "providers", "models",
"members", "councils", "runningSessions", "researchEnabled" }` — counts reflect enabled rows only,
except `councils` (all) and `runningSessions` (`queued` or `running`).

### GET /meta/providers

Supported protocols and one-click catalog presets for the settings UI.
Council strategies: `debate`, `swarm`, `critique`, `round_robin`, `review`,
`architect`, `red_team`.

## Providers

### GET /providers

`Provider[]` — `apiKeyEncrypted` is never returned; `hasApiKey: boolean` instead.

### POST /providers

```json
{
  "name": "OpenAI",
  "protocol": "openai_compatible",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "enabled": true
}
```

For `anthropic` and `google`, baseUrl may be omitted to use the adapter default.
`201 Provider`

### PATCH /providers/:id

Partial update. Omit `apiKey` to keep the stored key; send `null` or `""` to clear. `200 Provider`

### DELETE /providers/:id

Cascades models. Members referencing those models are disabled, not deleted.

### POST /providers/:id/test

Tests the configured default model and returns only `{ ok, latencyMs,
errorCode, message }`; secrets are never returned.

### GET /providers/:id/catalog

Live model availability for that provider, with pricing when the vendor (or
OpenRouter as a public overlay) publishes it.

`200 { supported, source, reason?, models: [{ modelId, displayName, contextWindow, inputPerMTokUsd, outputPerMTokUsd, enrolled }] }`

OpenAI-compatible providers are queried at `{baseUrl}/models`. Anthropic uses
`/v1/models`, Google uses `/v1beta/models`. OpenRouter's catalog includes
per-token prices, converted to USD per million tokens. For other hosts the
OpenRouter public catalog is used as a pricing overlay when ids match.

The settings UI prefers **POST /providers/:id/discover-models** (same body)
so a static file server cannot intercept the GET.

### POST /providers/:id/catalog/enroll

```json
{ "modelIds": ["openai/gpt-4o", "anthropic/claude-sonnet-4"] }
```

Creates missing models and refreshes pricing/context on ones already enrolled.
`200 { created, updated, models }`

### POST /providers/:id/discover-models

Same payload as `GET /providers/:id/catalog`. Kept as an alias.

## Models

### GET /models?providerId=

### POST /models

```json
{
  "providerId": "uuid",
  "modelId": "gpt-4o",
  "displayName": "GPT-4o",
  "contextWindow": 128000,
  "inputPerMTokUsd": 2.5,
  "outputPerMTokUsd": 10
}
```

Pricing fields are optional per-million-USD used for cost estimates.

### PATCH /models/:id ### DELETE /models/:id

### PATCH /models/batch

Updates up to 500 enrolled models atomically. Body: `{ "modelIds": ["uuid", ...], "patch": { "enabled": false } }`. The patch may include `displayName`, `contextWindow`, pricing fields, or `enabled`; all IDs must exist.

## Members (council seats)

### GET /members

Joined with model + provider names.

### POST /members

```json
{
  "name": "The Skeptic",
  "modelId": "model-uuid",
  "systemPrompt": "You stress-test every claim...",
  "temperature": 0.7,
  "maxTokens": 1500,
  "avatarColor": "#c9a227"
}
```

### PATCH /members/:id ### DELETE /members/:id

### PATCH /members/batch-model

Assigns one enabled model to up to 500 members and enables those seats. Body: `{ "memberIds": ["uuid", ...], "modelId": "uuid", "maxTokens": 4096 }`. `maxTokens` is optional and may be `null` to clear the override. The update is atomic.

Deleting a member removes it from all councils and its messages remain
(attributed by name in historical transcripts).

### DELETE /messages/:id

`405 { "error": { "code": "immutable" } }` — always. Transcripts are an audit
record. No session-deletion API is implemented yet. The route exists to answer with a clear
reason rather than a bare 404.

## Councils

### GET /meta/council-templates

Returns the six built-in council starting points. Each template includes a
stable key, description, strategy, rounds, moderator recommendation, use cases,
and suggested seat roles. Templates do not create members or councils by
themselves.

### GET /councils

Each council includes its member roster.

### POST /councils

```json
{
  "name": "War Council",
  "description": "Architecture decisions",
  "strategy": "debate",
  "rounds": 2,
  "memberIds": ["m1", "m2", "m3"],
  "moderatorMemberId": "m3"
}
```

`strategy`: `round_robin | debate | swarm | critique | review | architect | red_team`.
Moderator must be a member of the council.

### GET/PATCH/DELETE /councils/:id

## Sessions

### POST /sessions

```json
{
  "councilId": "uuid",
  "topic": "Should we migrate to Postgres?",
  "workspacePath": "/absolute/path/to/repo",
  "workspaceFiles": ["src/app.ts"],
  "researchEnabled": false
}
```

`workspacePath` is optional. When set, it must be an absolute folder (or file)
this process can read. Members receive a tree briefing and may call `list_dir`,
`read_file`, and `grep` inside that root. They cannot write. Symlink escapes and
common credential files are blocked. Grep is a case-insensitive literal search,
not a regular expression. Prioritized files do not restrict other reads within
the root; a pointed file grants access to its parent directory.

`researchEnabled` defaults to true; set false to avoid sending this topic to web
search services. The operator's `WEB_RESEARCH_ENABLED=false` overrides true
requests. The effective creation-time preference is saved in the session
snapshot and returned on Session DTOs. A later server-wide disable also blocks
research for queued sessions. Model calls are unaffected.

Returns `202 Session` and begins deliberation asynchronously.

### POST /workspace/preview

```json
{ "path": "/absolute/path/to/repo", "files": ["src/app.ts"] }
```

Validates the path and returns `{ ok, root, files, tree, fileCount, preview }`.

### GET /sessions?status=running&councilId=&search=&createdAfter=&createdBefore=&cursor=&limit=50

Supports status/council/search/date filters and cursor pagination. The cursor is
the `createdAt` value of the last returned row.

### GET /sessions/:id

Full snapshot: `{ session, messages, usage: { calls, tokens, cost }, lastEventSequence }`.
A session fails if no council member produces a response; individual failures
still allow successful peers to continue. Disabled models/providers are not called.

### POST /sessions/:id/cancel

Aborts in-flight LLM calls; status becomes `cancelled`.

### POST /sessions/:id/clone

Alias for rerun. Uses the original question, workspace, and research preference,
but current council configuration. Returns `409 council_missing` if the council
was deleted; no new session is created.

### POST /sessions/:id/rerun

Creates and starts a new session using the current council configuration.
The attached workspace and research preference are copied onto the new session.
The new snapshot records the current council. A deleted council returns HTTP 409.

### GET /sessions/:id/export?format=json|jsonl|markdown

Exports the historical session transcript without stored provider credentials.
Transcripts can still contain sensitive prompts, model output, or workspace excerpts.

### GET /sessions/:id/events (SSE)

Event stream. Events have durable `id` values and reconnects replay events after
`Last-Event-ID`. Events (all `data:` lines are JSON):
`session.started`, `round.started {round}`, `member.started {memberId, memberName}`,
`message.created {message}`, `member.completed {memberId, memberName}`,
`member.failed {memberId, memberName, error}`,
`round.completed {round}`, `moderator.started`,
`synthesis.completed {message}`, `session.completed`, `session.failed {error}`,
`usage.recorded {usage}`. Heartbeat comments every ~15s keep proxies happy.

## Headless CLI

`opencouncil doctor --json`, `opencouncil council list --json`,
`opencouncil session list --json`, and `opencouncil usage --json` operate
directly on the configured SQLite database and do not start an HTTP server.

## Configuration

### GET /config/export

`200 { "version": 1, "providers": [...], "models": [...], "members": [...],
"councils": [...] }`. Providers carry `hasSecret: boolean` and never the key
itself. Councils carry `memberIds` in seat order.

### POST /config/import

Accepts exactly what `GET /config/export` produces. Every row is validated
against `configImportSchema` before any write, so a malformed payload is a
`400 { "error": { "code": "invalid_config" } }` naming the offending field —
not a partial import. Rows are upserted by id inside a single transaction that
rolls back as a unit.

Secrets are never restored: `api_key_encrypted` is set to `NULL` for imported
providers and the response reports `"secretsImported": false`. Re-enter provider
keys after importing.

`200 { "ok": true, "imported": { "providers": n, "models": n, "members": n,
"councils": n }, "secretsImported": false }`

## Activity

### GET /activity/stats?days=30

```json
{ "totals": { "sessions": 12, "messages": 340, "promptTokens": 182000,
              "completionTokens": 96000, "totalTokens": 278000,
              "costUsd": 1.24, "errors": 2 },
  "daily": [{ "day": "2026-08-22", "tokens": 42000, "costUsd": 0.31 }],
  "byMember": [...], "byModel": [...], "byProvider": [...] }
```

`days` is an integer from 1 to 365 (default 30). The window includes today and
the preceding `days - 1` UTC calendar days. The response includes
`window: { since, until }` with an inclusive start and exclusive end. Totals,
breakdowns, daily usage, and recent activity all use this window.
`totals.unpricedCalls` counts successful calls without complete cost estimates.
Unpriced calls do not contribute to `costUsd`; zero does not mean all calls were free.

### GET /activity/export?days=30

Downloads `text/csv` as `opencouncil-usage-30d.csv`, with one row per usage record
(including failed calls), streamed in batches. It uses the same window as stats.
Columns: `id`, `session_id`, `created_at`, `member_name`, `provider_name`,
`model_name`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `cost_usd`,
`latency_ms`, `retry_count`, `error_code`, `status`. Unknown costs are blank.
No prompts, workspace contents, or provider keys are exported.

CSV fields are quoted and formula-leading text is prefixed with an apostrophe.
Spreadsheet applications differ in how they reinterpret CSV; do not enable
formulas or external links in untrusted exported names.
