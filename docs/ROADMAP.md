# OpenCouncil Roadmap

## v0.1 — The First Convening (current)

- [x] Monorepo scaffold (npm workspaces, strict TS, ESM)
- [x] SQLite persistence with embedded migrations
- [x] AES-256-GCM BYOK vault
- [x] Provider adapters: OpenAI-compatible, Anthropic, Google, Mock
- [x] Council engine: round-robin + debate strategies, parallel member calls
- [x] Moderator synthesis pass
- [x] Live SSE chamber streaming
- [x] Session lifecycle incl. cancellation
- [x] Usage metering: tokens, latency, cost estimates
- [x] Activity dashboard
- [x] Settings UI for providers/models/members/councils
- [x] Demo council seeding on first boot

## v0.2 — Deeper Deliberation

- True token-level streaming into the chamber (SSE deltas per message)
- Voting / consensus scoring: members rate each proposal, weighted aggregation
- Per-council system prompt templates & persona library
- Structured output modes (JSON schema enforcement) for machine-consumable verdicts
- Retry/backoff policies per provider; circuit breakers

## v0.3 — Research Tools

- Tool use in deliberation: web search, URL fetch, code execution sandbox
- Shared "research desk" where members pin sources mid-session
- Citation tracking through to synthesis

## v0.4 — Operations

- Multi-user auth (passkeys), roles
- Budget caps: hard stop when spend exceeds limit; per-council budgets
- Export: session transcripts as Markdown/JSON, activity as CSV
- Postgres backend option behind the same repository interface
- Docker Compose bundle + Helm chart

## v1.0 — Public Council

- Plugin API for custom strategies (user-authored orchestration)
- Webhooks / event subscriptions
- i18n
- Packaged desktop app (Tauri)
