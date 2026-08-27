# OpenCouncil Architecture

## Mission

OpenCouncil is a self-hosted, BYOK platform where a user convenes multiple LLMs —
across any provider — as a council. One prompt is put to the whole council; each
member researches independently; members then deliberate in a shared chatroom,
respond to each other, and converge on an agreed answer. Every turn is streamed
live to the chamber UI, logged, and metered for usage and cost.

The design principle: **the user owns the keys, the data, and the orchestration.**
No OpenCouncil-hosted inference. No vendor lock-in. The entire harness —
orchestration, delegation, personas, strategies — is configurable.

## Stack

| Layer      | Choice                                                          | Why                                                                                                                              |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Language   | TypeScript everywhere (strict)                                  | one mental model, shared types                                                                                                   |
| Monorepo   | plain directories, one root manifest                            | no workspace linking to keep in sync; resolution runs through TS `paths`, an esbuild `--alias`, and Next's tsconfig-path support |
| Web        | Next.js 14 (App Router) + React 18 + SSE                        | streaming transcript without websocket infra                                                                                     |
| Server     | Node 20+, Fastify, ESM                                          | fast, schema-light, first-class SSE                                                                                              |
| DB         | SQLite via Node.js `node:sqlite`                                | single-file, zero-ops, no native addon install                                                                                   |
| Providers  | OpenAI-compatible HTTP, Anthropic Messages, Google Gemini, Mock | covers ~95% of the market incl. local runtimes (Ollama, LM Studio, vLLM)                                                         |
| Validation | zod at every trust boundary                                     | API + config + env share one grammar                                                                                             |
| Styling    | hand-rolled CSS custom properties                               | no framework tax, full theming control                                                                                           |

## Repository layout

```
opencouncil/
├── apps/
│   ├── server/          Fastify API + council engine
│   │   └── src/
│   │       ├── index.ts         entrypoint
│   │       ├── app.ts           buildApp(): plugins + routes
│   │       ├── config.ts        env parsing
│   │       ├── db/
│   │       │   ├── connection.ts
│   │       │   ├── migrate.ts   embedded migrations
│   │       │   └── seed.ts      demo council seeding
│   │       ├── vault/
│   │       │   └── crypto.ts    AES-256-GCM key storage
│   │       ├── providers/
│   │       │   ├── types.ts     ProviderAdapter interface
│   │       │   ├── registry.ts  adapter lookup by protocol
│   │       │   ├── openai-compatible.ts
│   │       │   ├── anthropic.ts
│   │       │   ├── google.ts
│   │       │   └── mock.ts
│   │       ├── engine/
│   │       │   ├── bus.ts            per-session event bus (SSE fan-out)
│   │       │   ├── session-manager.ts session lifecycle
│   │       │   ├── runner.ts         the deliberation loop
│   │       │   ├── moderator.ts      synthesis pass
│   │       │   └── strategies/
│   │       │       ├── types.ts
│   │       │       ├── round-robin.ts
│   │       │       └── debate.ts
│   │       ├── routes/
│   │       │   ├── councils.ts
│   │       │   ├── models.ts
│   │       │   ├── providers.ts
│   │       │   ├── members.ts
│   │       │   ├── sessions.ts
│   │       │   └── activity.ts
│   │       └── lib/
│   │           ├── errors.ts    domain error -> HTTP mapping
│   │           └── http.ts      typed fetch helper
│   └── web/             Next.js chamber UI
│       └── app/
│           ├── layout.tsx  root shell + nav
│           ├── page.tsx    sessions overview
│           ├── globals.css
│ OC        ├── sessions/
│           │   ├── page.tsx        all sessions list
│           │   └── [id]/page.tsx   the chamber (live transcript)
│           ├── settings/page.tsx   providers / models / members / councils
│           └── activity/page.tsx   usage dashboard
│               └── components/
│                   └── ActivityDashboard.tsx
├── packages/shared/src/  zod schemas + TS types shared both sides
└── docs/                 architecture, roadmap, API reference
```

## Data model

```
providers        id, name, kind(static|openai_compatible), baseUrl, apiKeyEncrypted,
                 defaultModelId, enabled, timestamps
models           id(uuid), providerId FK, modelId(string e.g. gpt-4o),
                 displayName, contextWindow, enabled
members          id(uuid), name, modelId FK, systemPrompt, temperature,
                 maxTokens, avatarColor, enabled
councils         id(uuid), name, description, strategy(round_robin|debate),
                 rounds, moderatorMemberId nullable FK, createdAt
council_members  councilId+memberId composite PK (join table)
sessions         id(uuid), councilId FK, topic, status(queued|running|
                 completed|failed|cancelled), error, startedAt, completedAt
messages         id(uuid auto), sessionId FK, memberId nullable (null = user/moderator-sys),
                 role(user|assistant), kind(discussion|synthesis|user|system),
                 round int, content text, createdAt
usage_events     sessionId, memberName, providerName, modelName, promptTokens,
                 completionTokens, totalTokens, costUsd, latencyMs, status(ok|error)
activity_log     ts, action(e.g. provider.created), detail JSON
settings_kv      key PK, value JSON (app settings: currency, budget caps later)
```

Key invariants:

- `providers.api_key_encrypted` never leaves the server unencrypted; API responses
  return `hasApiKey` boolean only.
- Deleting a provider cascades its models; deleting a member removes it from
  councils; deleting a council keeps its sessions (history preserved).
- `messages.kind='synthesis'` marks the moderator's final answer.

## BYOK vault

Keys are encrypted at rest with AES-256-GCM. The master key comes from the
`OPEN_COUNCIL_SECRET_KEY` env var (any string ≥ 8 chars); scrypt derives the
AES key. If the var is absent, a random ephemeral key is generated **per boot**
— keys stored while ephemeral become unreadable after restart, which the UI
surfaces as a warning banner. For production, set the env var.

Ciphertext format: `<iv_b64>:<tag_b64>:<data_b64>`.

## Provider adapters

One interface:

```ts
interface ProviderAdapter {
  readonly protocol: ProviderProtocol
  chat(opts: {
    baseUrl: string
    apiKey?: string
    modelId: string
    messages: ChatMessage[]
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
    timeoutMs: number
  }): Promise<ChatResult>
}
```

- `openai-compatible`: POST `{baseUrl}/chat/completions`. Covers OpenAI, Groq,
  Together, Fireworks, DeepSeek, Mistral, xAI, Perplexity, Ollama (`/v1`),
  LM Studio, vLLM, OpenRouter.
- `anthropic`: POST `{baseUrl}/v1/messages`, `x-api-key` header,
  `anthropic-version: 2023-06-01`.
- `google`: POST `{baseUrl}/v1beta/models/{model}:generateContent`,
  `x-goog-api-key` header. System prompt goes in `systemInstruction`.
- `mock`: deterministic offline council for demos/tests — no network.

Adapters throw typed errors (`AuthError`, `RateLimitError`, `TimeoutError`,
`ProviderHttpError`) that map to precise HTTP codes and session failure reasons.

## Council engine

A session runs through phases driven by its council's strategy:

1. **Round-robin** (default): each active member answers the topic in parallel
   per round. After N rounds, the moderator (if set) receives the full
   transcript and produces the synthesis.
2. **Debate**: round 1 = independent positions; each subsequent round every
   member sees the _full transcript so far_ and may rebut, concede, or refine.
   Moderator synthesizes at the end.

Engine mechanics:

- `session-manager` owns lifecycle: queued → running → completed | failed |
  cancelled, with abort controllers so a running session can be cancelled.
- `bus` fans out typed events per session to any number of SSE subscribers:
  `session.started`, `round.started`, `member.started`, `message.created`,
  `member.completed`, `round.completed`, `moderator.started`,
  `synthesis.completed`, `session.completed`, `session.failed`, `usage.recorded`.
- Every LLM call writes a `usage_event` row (tokens, latency, cost estimate).
  Cost = tokens × per-model pricing if configured on the model row, else null.
- Failures are per-member: one member erroring doesn't kill the council —
  the transcript records the failure and the rest continue.

## Moderation

Any enabled member can be flagged as the council's moderator (one per council,
nullable). The moderator gets a synthesis system prompt ("chair of the council")
plus the transcript, and must produce the final agreed answer. If no moderator
is configured, the session completes with the raw transcript only.

## API surface

Base URL: `http://localhost:4311/api/v1`

```
GET    /health
GET    /meta/providers            supported protocols + catalog presets
GET    /providers                 list (keys redacted)
POST   /providers                 add {name, protocol, baseUrl?, apiKey?, ...}
PATCH  /providers/:id             update (apiKey optional = keep existing)
DELETE /providers/:id             cascade models
GET    /models                    ?providerId=
POST   /models                    register {providerId, modelId, displayName...}
PATCH  /models/:id                toggle/edit
DELETE /models/:id
GET    /members                   council seats w/ their model joined
POST   /members                   create seat {name, modelId, systemPrompt...}
PATCH  /members/:id
DELETE /members/:id
GET    /councils                  with members joined
POST   /councils                  {name, strategy, rounds, memberIds[], moderatorMemberId?}
GET    /councils/:id
PATCH  /councils/:id
DELETE /councils/:id              sessions kept
GET    /sessions                  ?status=&limit=
POST   /sessions                  {councilId, topic} → starts immediately (202)
GET    /sessions/:id              snapshot incl. messages
POST   /sessions/:id/cancel       abort a running council
GET    /sessions/:id/events       SSE live stream
GET    /activity/stats?days=30    aggregates: totals, per-day series,
                                  per-member, per-model, per-provider
```

Errors: consistent envelope `{ error: { code, message, details? } }`.

## Frontend

Five surfaces, dark-chamber aesthetic (deep charcoal, brass/gold accents):

- `/` + `/sessions` — session history, statuses, quick-start composer.
- `/sessions/[id]` — the Chamber: left rail of council members (live status
  dots: thinking/speaking/done/error), center transcript grouped by round,
  synthesis pinned at top when present, live SSE updates, cancel button,
  token/cost footer per message.
- `/settings` — tabbed CRUD for Providers (add OpenAI/Anthropic/Google/Ollama/
  custom with base URL + key), Models, Members (persona prompts, temperature),
  Councils (strategy, rounds, roster, moderator pick).
- `/activity` — totals cards, daily bar chart (pure CSS bars, no chart lib),
  per-member/model/provider tables.

State: server components fetch initial data; the chamber hydrates from the
snapshot endpoint then subscribes to SSE. Poll-free, push-driven.

## Security posture

- Keys encrypted at rest (see vault).
- Default bind `127.0.0.1`; remote exposure requires explicit HOST override +
  is the operator's responsibility (docs say: put behind a reverse proxy with auth).
- No telemetry, no outbound calls except to user-configured provider endpoints.
- CORS: same-origin by default (web app proxies `/api` to the server).

## Testing

Vitest across packages:

- unit: vault roundtrip, adapters against `mock` protocol + intercepted fetch,
  strategies' ordering logic, activity aggregation math.
- integration: in-memory SQLite migration chain, REST routes via `app.inject()`
  (Fastify's light-my-request), full mock-council session end-to-end through the
  engine with event capture.

CI (GitHub Actions): install → typecheck → lint → test → build on every push/PR.

## Deliberately out of scope (for now)

Web search tools inside deliberation, vector memory, multi-user auth/SSO,
Postgres backend, docker-compose bundle. All are roadmap items (see ROADMAP.md);
the schema and interfaces leave room for them without breaking changes.
