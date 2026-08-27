# OpenCouncil API Reference

Base URL: `http://localhost:4311/api/v1`
All bodies JSON. Errors use `{ "error": { "code": string, "message": string } }`.

## System

### GET /health

`200 { "ok": true, "version": string, "instanceId": string }` — `instanceId`
is stable for the lifetime of the server process.

### GET /system/health

Identical to `GET /health`. Both exist so health checks can point at either
path; neither touches the database.

### GET /system/info

`200 { "version", "instanceId", "uptimeSeconds", "providers", "models",
"members", "councils", "runningSessions" }` — counts reflect enabled rows only,
except `councils` (all) and `runningSessions` (`queued` or `running`).

### GET /meta/providers

Supported protocols and one-click catalog presets for the settings UI.

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

For `static` protocol (anthropic/google), baseUrl may be omitted to use the default.
`201 Provider`

### PATCH /providers/:id

Partial update. Omit `apiKey` to keep the stored key; send `null`... (not allowed) —
send `"apiKey": ""` to clear. `200 Provider`

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

Deleting a member removes it from all councils and its messages remain
(attributed by name in historical transcripts).

### DELETE /messages/:id

`405 { "error": { "code": "immutable" } }` — always. Transcripts are an audit
record; delete the session instead. The route exists to answer with a clear
reason rather than a bare 404.

## Councils

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

`strategy`: `round_robin | debate`. Moderator must be a member of the council.

### GET/PATCH/DELETE /councils/:id

## Sessions

### POST /sessions

```json
{ "councilId": "uuid", "topic": "Should we migrate to Postgres?" }
```

Returns `202 Session` and begins deliberation asynchronously.

### GET /sessions?status=running&councilId=&search=&createdAfter=&createdBefore=&cursor=&limit=50

Supports status/council/search/date filters and cursor pagination. The cursor is
the `createdAt` value of the last returned row.

### GET /sessions/:id

Full snapshot: session + ordered messages + usage summary + moderator name.

### POST /sessions/:id/cancel

Aborts in-flight LLM calls; status becomes `cancelled`.

### POST /sessions/:id/clone

Creates and starts a new session using the original execution snapshot.

### POST /sessions/:id/rerun

Creates and starts a new session using the current council configuration.

### GET /sessions/:id/export?format=json|jsonl|markdown

Exports the historical session transcript without secrets.

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
