# OpenCouncil Architecture

## Scope and stack

OpenCouncil is a single-operator BYOK council application. A Fastify API and
statically exported Next.js UI ship as one Node process. SQLite stores
configuration, transcripts, usage, and durable events. Provider keys are
encrypted at rest; other database contents are plaintext.

The current stack is TypeScript, Fastify 5, Next.js 16, React 19, Zod 3, and
Node's built-in SQLite module (Node 22.5+). Fastify/Next upgrades are urgent
maintenance work; see [the audit](AUDIT.md), not an assumption of current support.

## Source layout

| Location                                     | Responsibility                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/server/src/cli.ts`                     | Packaged CLI, headless commands, static UI server                         |
| `apps/server/src/index.ts`                   | API-only development entry point                                          |
| `apps/server/src/app.ts`                     | App factory, request guards, database helpers                             |
| `apps/server/src/db/connection.ts`           | SQLite interface, seven embedded migrations, interrupted-session recovery |
| `apps/server/src/routes/`                    | Providers/models, members/councils, sessions/workspaces, config, activity |
| `apps/server/src/engine/runner.ts`           | Research, rounds, tool hops, synthesis, metering                          |
| `apps/server/src/engine/prompts.ts`          | Member prompt contract and evidence/instruction separation                |
| `apps/server/src/engine/session-manager.ts`  | Queue, four concurrent sessions, cancellation and directives              |
| `apps/server/src/engine/execution-policy.ts` | Retries, backoff, two concurrent calls per provider                       |
| `apps/server/src/engine/workspace.ts`        | Read-only tree, file, and literal-search tools                            |
| `apps/server/src/engine/bus.ts`              | Session event sequence numbers and pub/sub                                |
| `apps/server/src/providers/`                 | OpenAI-compatible, Anthropic, Google, mock adapters and model catalogs    |
| `apps/web/app/`                              | Home, history, `/sessions/view/?id=…`, settings, activity                 |
| `packages/shared/src/`                       | Domain DTOs, event types, inbound Zod schemas                             |

Root scripts build shared declarations, two esbuild server bundles, and a static
Next export copied into `apps/server/dist/public`. Shared and server build outputs
are committed for archive installs. Development uses Next on port 3000 with
same-origin `/api` rewrites to the API on 4311.

## Session flow

1. Validate the request and workspace; insert a queued session with a descriptive
   council snapshot and research preference.
2. The manager runs up to four sessions at once. Remaining jobs wait in memory.
3. The runner loads the council, records the question, and optionally researches
   it. A global disable overrides the session's research preference.
4. Members deliberate under one of seven strategies. Debate and architecture
   are sequential; round-robin, swarm, critique, review, and red-team run peers
   in parallel. Strategy code controls which earlier responses are visible.
5. Each provider has a two-call semaphore. Temporary provider errors retry with
   bounded backoff. Retry-After is honored up to 60 seconds; longer requests fail
   that turn rather than retrying too soon. Auth errors do not retry.
6. Attached workspaces add bounded text briefings and up to four tool-follow-up
   hops. Tools can read but not modify files. Tool arguments and returned text
   are bounded. Prompt fitting uses a conservative UTF-8 byte estimate, always
   retaining the system contract and final task; it is not a provider tokenizer.
7. Successful responses and usage are persisted and emitted. Individual failures
   produce error records; no successful member response means session failure.
8. An optional moderator synthesizes the transcript. Final cancellation is checked,
   terminal state is persisted, then the completion event is published.

The session snapshot preserves historical names/settings for display; it is not
an immutable executable plan. Queued sessions still read live configuration at
execution time. Clone/rerun use current council configuration and copy the question,
workspace, and research preference. Exact reproducibility is future work.

## Persistence and events

Tables include providers, models, members, councils, council_members, sessions,
messages, usage_events, session_events, activity_log, and schema_migrations.
Deleting configuration preserves session history. Message order is
`round, round_position, id`. Startup marks interrupted sessions failed.

The bus persists an event before delivery. SSE supports `Last-Event-ID` and an
`after` query cursor. The chamber advances its resume cursor and ignores duplicate
IDs, preventing replayed usage from being counted twice. Tokens are currently
shown after complete messages, not streamed token by token.

Usage estimates require both input and output prices. Missing estimates are
flagged in Activity; spend is not a provider invoice. Dashboard and CSV windows
use UTC calendar days, including today. CSV batches are bounded to 1,000 rows.

## Trust boundaries

- Vault keys come from `OPEN_COUNCIL_SECRET_KEY` or a generated `.secret_key`
  beside the database. Failure to persist a generated key warns and falls back
  to an ephemeral key. Backups must retain the matching encryption key.
- The default bind and Compose published port are loopback. Optional
  single-operator authentication protects API and SSE routes. Browser Fetch
  Metadata, Origin, and allowed-host checks remain defense in depth.
- Workspace paths are canonicalized, external symlink targets rejected, and
  common credentials blocked. These checks are not a hostile-filesystem sandbox
  and cannot find all secrets in source code.
- Web research sends topics to search providers unless disabled. Model catalogs
  may contact OpenRouter for price overlays. The browser loads Mermaid from a
  CDN. External transcript images require a click, and generated links accept
  only explicit allowed schemes.

See [SECURITY.md](../SECURITY.md), [API.md](API.md), and [ROADMAP.md](ROADMAP.md).
