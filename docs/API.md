# OpenCouncil API Reference

Base URL: `http://localhost:4311/api/v1`
All bodies JSON. Errors use `{ "error": { "code": string, "message": string } }`.

## System

### GET /health
`200 { "ok": true, "version": string }`

### GET /meta/providers
Supported protocols and one-click catalog presets for the settings UI.

## Providers

### GET /providers
`Provider[]` — `apiKeyEncrypted` is never returned; `hasApiKey: boolean` instead.

### POST /providers
```json
{ "name": "OpenAI", "protocol": "openai_compatible", "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...", "enabled": true }
```
For `static` protocol (anthropic/google), baseUrl may be omitted to use the default.
`201 Provider`

### PATCH /providers/:id
Partial update. Omit `apiKey` to keep the stored key; send `null`... (not allowed) —
send `"apiKey": ""` to clear. `200 Provider`

### DELETE /providers/:id
Cascades models. Members referencing those models are disabled, not deleted.

## Models

### GET /models?providerId=
### POST /models
```json
{ "providerId": "uuid", "modelId": "gpt-4o", "displayName": "GPT-4o",
  "contextWindow": 128000, "inputPerMTokUsd": 2.5, "outputPerMTokUsd": 10 }
```
Pricing fields are optional per-million-USD used for cost estimates.

### PATCH /models/:id   ### DELETE /models/:id

## Members (council seats)

### GET /members
Joined with model + provider names.

### POST /members
```json
{ "name": "The Skeptic", "modelId": "model-uuid",
  "systemPrompt": "You stress-test every claim...", "temperature": 0.7,
  "maxTokens": 1500, "avatarColor": "#c9a227" }
```

### PATCH /members/:id   ### DELETE /members/:id
Deleting a member removes it from all councils and its messages remain
(attributed by name in historical transcripts).

## Councils

### GET /councils
Each council includes its member roster.

### POST /councils
```json
{ "name": "War Council", "description": "Architecture decisions",
  "strategy": "debate", "rounds": 2,
  "memberIds": ["m1", "m2", "m3"], "moderatorMemberId": "m3" }
```
`strategy`: `round_robin | debate`. Moderator must be a member of the council.

### GET/PATCH/DELETE /councils/:id

## Sessions

### POST /sessions
```json
{ "councilId": "uuid", "topic": "Should we migrate to Postgres?" }
```
Returns `202 Session` and begins deliberation asynchronously.

### GET /sessions?status=running&limit=50

### GET /sessions/:id
Full snapshot: session + ordered messages + usage summary + moderator name.

### POST /sessions/:id/cancel
Aborts in-flight LLM calls; status becomes `cancelled`.

### GET /sessions/:id/events   (SSE)
Event stream. Events (all `data:` lines are JSON):
`session.started`, `round.started {round}`, `member.started {memberName}`,
`message.created {message}`, `member.completed {memberName}`,
`round.completed {round}`, `moderator.started`,
`synthesis.completed {message}`, `session.completed`, `session.failed {error}`,
`usage.recorded {usage}`. Heartbeat comments every ~15s keep proxies happy.

## Activity

### GET /activity/stats?days=30
```json
{ "totals": { "sessions": 12, "messages": 340, "promptTokens": 182000,
              "completionTokens": 96000, "totalTokens": 278000,
              "costUsd": 1.24, "errors": 2 },
  "daily": [{ "day": "2026-08-22", "tokens": 42000, "costUsd": 0.31 }],
  "byMember": [...], "byModel": [...], "byProvider": [...] }
```
