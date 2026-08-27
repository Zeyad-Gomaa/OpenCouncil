# 🏛 OpenCouncil

**A self-hosted, bring-your-own-key platform where multiple LLMs convene as a
council — research the question, debate each other, and agree on an answer
while you watch every word in a live chamber.**

No middleman inference service. No per-seat fees. Your keys, your models,
your orchestration.

## How it works

1. **Register providers** (OpenAI, Anthropic, Google, OpenRouter, Groq, Ollama,
   LM Studio — anything speaking those protocols) with your own API keys.
   Keys are encrypted at rest with AES-256-GCM.
2. **Enroll models** under each provider and mint **members** — council seats
   bound to a model, each with its own persona system prompt and sampling
   settings.
3. **Convene a council**: pick members, choose a strategy (`round_robin` or
   `debate`), set rounds, optionally appoint a **moderator** member who writes
   the final synthesis of what the council agrees on.
4. **Put a question to the council.** Members answer in parallel rounds,
   reading the full transcript as it develops, rebutting and converging. You
   watch live via SSE while usage — tokens, latency, cost estimates — is
   metered per message.

## Install

**From GitHub (recommended):**

```bash
npm install -g github:Zeyad-Gomaa/OpenCouncil
opencouncil
```

The GitHub package includes the production server and static UI artifacts, so installation does not compile the app. `opencouncil` serves the API + UI on one port (default 4311).

The executable also supports headless workflows. `opencouncil --version` reads
the package manifest, and invalid flags fail with exit code 2.

**Run without installing globally:**

```bash
git clone https://github.com/Zeyad-Gomaa/OpenCouncil.git
cd OpenCouncil && npm install && npm run build
npm start                 # or: npx opencouncil
```

**Docker:**

```bash
export OPEN_COUNCIL_SECRET_KEY=$(openssl rand -hex 32)
docker compose up -d      # http://localhost:4311, data in a named volume
```

**Development mode** (API and web dev server side by side):

```bash
npm install
npm run dev               # API :4311, chamber UI :3000
```

`npm run dev` builds the shared package and server bundle, then runs the API
next to `next dev`, which proxies `/api/*` to it. Open http://localhost:3000.
Server source changes need `npm run build:server` to take effect.

Open http://localhost:4311 (or :3000 in dev mode). A demo council of mock
members is seeded on first boot so you can watch a full deliberation
immediately without any API keys.

For real deliberations:

```bash
cp .env.example .env
# set OPEN_COUNCIL_SECRET_KEY (required to persist provider keys across restarts)
# Settings → Providers → add your provider + key
```

## Configuration

OpenCouncil reads `.env` from the working directory at startup. Real
environment variables win over the file, and CLI flags win over both. Point at
a different file with `OPEN_COUNCIL_ENV_FILE`.

| Variable                  | Flag         | Default                 | Purpose                                                                                                          |
| ------------------------- | ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `OPEN_COUNCIL_SECRET_KEY` | —            | ephemeral               | Master key encrypting provider API keys at rest. **Set this**, or stored keys become unreadable after a restart. |
| `HOST`                    | `-H, --host` | `127.0.0.1`             | Bind address. Use `0.0.0.0` only behind an authenticating proxy.                                                 |
| `PORT`                    | `-p, --port` | `4311`                  | HTTP port.                                                                                                       |
| `DATABASE_PATH`           | `--db`       | `./data/opencouncil.db` | SQLite database file.                                                                                            |
| `SEED_DEMO_COUNCIL`       | `--no-seed`  | `true`                  | Seed the mock demo council on an empty database.                                                                 |
| `LOG_LEVEL`               | —            | `info`                  | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace`                                                               |

Generate a master key with `openssl rand -hex 32`.

## Headless and automation mode

The local CLI uses the same SQLite database and council engine as the web
application; it does not start Fastify to run a local council.

```bash
opencouncil --help
opencouncil doctor
opencouncil council list
opencouncil council run --council "Architecture Council" "Review this design"
```

The HTTP API is under `/api/v1`. Session SSE streams use durable event IDs and
replay events after `Last-Event-ID`. Session snapshots retain display data even
after the originating council, member, model, or provider is deleted.

## Data, upgrades, and backups

The default database is `./data/opencouncil.db`; set `DATABASE_PATH` or use
`--db` to relocate it. Stop the process before copying the database and keep
`OPEN_COUNCIL_SECRET_KEY` backed up with it. Schema migrations run automatically
at startup and are recorded in `schema_migrations`.

## The Chamber

- Live transcript grouped by round; every message shows tokens, latency and cost.
- Member rail with live status dots (thinking / speaking / done / error).
- Synthesis pinned at the top once the moderator concludes.
- Cancel any running session; failed members don't kill the council.

## Activity & logs

`/activity` gives totals (sessions, messages, tokens, spend), daily series,
and per-member / per-model / per-provider breakdowns. Every LLM call writes a
usage event; administrative actions write to an activity log.

## Repository layout

```
apps/server      Fastify API + council engine + SQLite persistence
apps/web         Next.js chamber UI (static export)
packages/shared  zod schemas + types shared across both apps
docs/            architecture, roadmap, API reference
```

`apps/server/dist/` and `packages/shared/dist/` are committed build output — the
first is what makes `npm install github:…` skip compiling Next.js, the second is
what `apps/server` typechecks against. Regenerate both with `npm run build`.

## Development

```bash
npm run dev         # API + chamber UI
npm test            # vitest suite
npm run typecheck   # strict TS across the monorepo
npm run lint        # eslint
npm run format      # prettier --write
npm run build       # shared → server → web
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and
[SECURITY.md](SECURITY.md) for the threat model and how to report a
vulnerability.

Environment: see `.env.example`. Node ≥ 22.5 (SQLite is provided by Node; no native addon compilation is required).

## Security notes

- Provider keys are encrypted at rest; the API never returns them, only a
  `hasApiKey` flag.
- Server binds `127.0.0.1` by default. If you expose it, put it behind a
  reverse proxy with authentication — OpenCouncil has no built-in multi-user
  auth yet (see roadmap).
- No telemetry. Outbound requests go only to the provider base URLs you
  configure.
- Configuration exports contain secret-presence metadata only, never raw
  provider keys, and importing one never restores a secret.

## License

MIT © 2026 Zeyad Gomaa
