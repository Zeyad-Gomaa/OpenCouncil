# OpenCouncil

Self-hosted, bring-your-own-key councils of language models. Several models
research a question, debate each other, and agree on an answer while you watch
the transcript live. There is no hosted inference and no per-seat fee. You
bring the keys. OpenCouncil runs the orchestration.

The API and the chamber UI ship as one Node process on one port.

## Requirements

- Node 22.5 or newer (`node:sqlite` is built in; no native addon to compile)
- A provider key for real deliberations (OpenAI, Anthropic, Google, OpenRouter,
  Groq, xAI, Mistral, Together, DeepSeek, or a local runtime such as Ollama,
  LM Studio, or vLLM)

## Install

**From a clone:**

```bash
git clone https://github.com/Zeyad-Gomaa/OpenCouncil.git
cd OpenCouncil
npm install
npx opencouncil
```

`npm install` installs dependencies. If the prebuilt server or UI is missing,
it compiles them. `npx opencouncil` then serves the API and the chamber on
port 4311.

Open http://127.0.0.1:4311. A demo council of mock members is seeded on first
boot, so you can watch a full deliberation without any API keys.

**Global install from a GitHub archive:**

```bash
npm install -g https://github.com/Zeyad-Gomaa/OpenCouncil/archive/refs/heads/main.tar.gz
opencouncil
```

The archive includes the production server and static UI, so installation does
not compile Next.js. Prefer a tagged release
(`.../refs/tags/vX.Y.Z.tar.gz`) when you want a pinned version.

Do not use `npm install -g github:Zeyad-Gomaa/OpenCouncil`. npm installs a
global git dependency by symlinking it into `~/.npm/_cacache/tmp`, which npm
later garbage-collects. The command then breaks, and the dangling link makes
every later install fail with `ENOTDIR ... rename`. If you already hit that:

```bash
rm -f "$(npm config get prefix)/lib/node_modules/opencouncil" \
      "$(npm config get prefix)/bin/opencouncil"
```

Installing the git spec into a _project_ (`npm install github:...`, no `-g`)
is unaffected.

**Rebuild from source** (after changing the UI or server):

```bash
npm run build
npm start                 # or: npx opencouncil
```

Restart the process after an update. A running binary does not pick up a new
`dist` until you stop it and start it again.

**Docker:**

```bash
export OPEN_COUNCIL_SECRET_KEY=$(openssl rand -hex 32)
docker compose up -d      # http://localhost:4311, data in a named volume
```

**Development** (API and Next.js side by side):

```bash
npm install
npm run dev               # API :4311, chamber UI :3000
```

`npm run dev` builds the shared package and server bundle, then runs the API
next to `next dev`, which proxies `/api/*` to it. Open http://localhost:3000.
Server source changes need `npm run build:server` to take effect.

## First real session

```bash
cp .env.example .env
# set OPEN_COUNCIL_SECRET_KEY so stored provider keys survive a restart
```

Then in Settings:

1. **Providers.** Add a preset (OpenRouter is the fastest way to mix vendors)
   and paste your key. Adding a provider opens the live catalog.
2. **Pull models.** Settings also has Pull models on each provider card. That
   lists live availability and published $/MTok prices, then lets you enroll
   the ones you want. OpenRouter publishes native prices. Other hosts are
   listed from their model APIs, with OpenRouter used as a price overlay when
   ids match.
3. **Members.** Bind a model to a named seat and, if you want, a persona
   prompt.
4. **Councils.** Pick members, a strategy, rounds, and an optional moderator
   who writes the final synthesis.

On Home, choose a council, type a question, and send. Optionally **Attach
folder** and point at an absolute path this process can read
(`/Users/you/project`). Agents then get a file tree briefing and read-only
tools (`list_dir`, `read_file`, `grep`). They cannot write. Use this for code
review, architecture, and red-team councils.

## How a council runs

1. You register providers with your own keys. Keys are encrypted at rest with
   AES-256-GCM and are never returned by the API.
2. You enroll models and mint members: seats bound to a model, each with its
   own system prompt and sampling settings.
3. You convene a council with a strategy:
   - `debate`: sequential roundtable; later speakers see earlier turns
   - `swarm`: parallel, shared memory
   - `critique`: independent takes, then a review round
   - `round_robin`: independent parallel takes
   - `review`: code review (bugs, tests, API shape, ship / request-changes)
   - `architect`: sequential design, then refine
   - `red_team`: try to break the proposed approach
4. You put a question to the council. Members answer in rounds, reading the
   transcript as it develops. You watch live over SSE. Usage (tokens, latency,
   estimated cost) is metered per message.

Each session starts with web research (DuckDuckGo, then Wikipedia; Tavily,
Brave, or SearXNG if you set a key). Research can include page results, images,
and YouTube links.

## The chamber

- Live transcript grouped by round. Older rounds collapse so long sessions
  stay light. Very long messages are clamped until you expand them.
- Member rail with live status (waiting, thinking, done, error).
- Synthesis pinned at the top once a moderator concludes.
- Steer a running debate with a directive, add a round, or end early.
- Cancel any running session. A failed member does not kill the council.
- Failed or invalid Mermaid diagrams fall back to source instead of dumping a
  parser error into the page.

`/activity` shows totals (sessions, messages, tokens, spend), a daily series,
and per-member / per-model / per-provider breakdowns.

## Configuration

OpenCouncil reads `.env` from the working directory at startup. Real
environment variables win over the file, and CLI flags win over both. Point at
a different file with `OPEN_COUNCIL_ENV_FILE`.

| Variable                  | Flag         | Default                 | Purpose                                                                                                      |
| ------------------------- | ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `OPEN_COUNCIL_SECRET_KEY` |              | ephemeral               | Master key encrypting provider API keys at rest. Set this, or stored keys become unreadable after a restart. |
| `HOST`                    | `-H, --host` | `127.0.0.1`             | Bind address. Use `0.0.0.0` only behind an authenticating proxy.                                             |
| `PORT`                    | `-p, --port` | `4311`                  | HTTP port.                                                                                                   |
| `DATABASE_PATH`           | `--db`       | `./data/opencouncil.db` | SQLite database file.                                                                                        |
| `SEED_DEMO_COUNCIL`       | `--no-seed`  | `true`                  | Seed the mock demo council on an empty database.                                                             |
| `LOG_LEVEL`               |              | `info`                  | `fatal` / `error` / `warn` / `info` / `debug` / `trace`                                                      |

Optional research backends: `TAVILY_API_KEY`, `BRAVE_API_KEY`, `SEARXNG_URL`.
If none are set, research still runs through DuckDuckGo and Wikipedia.

Generate a master key with `openssl rand -hex 32`.

## Headless and automation

The local CLI uses the same SQLite database and council engine as the web
application. It does not start Fastify to run a local council.

```bash
opencouncil --help
opencouncil doctor
opencouncil council list
opencouncil council run --council "Architecture Council" "Review this design"
```

`opencouncil --version` reads the package manifest. Invalid flags fail with
exit code 2.

The HTTP API is under `/api/v1`. See [docs/API.md](docs/API.md). Session SSE
streams use durable event IDs and replay after `Last-Event-ID`. Session
snapshots stay readable after the originating council, member, model, or
provider is deleted.

## Data, upgrades, and backups

The default database is `./data/opencouncil.db`. Set `DATABASE_PATH` or use
`--db` to relocate it. Stop the process before copying the database and keep
`OPEN_COUNCIL_SECRET_KEY` backed up with it. Neither is useful without the
other. Schema migrations run automatically at startup and are recorded in
`schema_migrations`.

## Troubleshooting

**Pull models returns "no such API route".** The process you are talking to is
an older binary. Stop it and start again (`npx opencouncil` or `npm start`)
from a tree that has been built. The UI lists models with
`POST /api/v1/providers/:id/discover-models`.

**Stored API keys stopped working after a restart.** `OPEN_COUNCIL_SECRET_KEY`
was missing or changed. Set it in `.env` to a stable value and re-enter the
keys once.

**Install from `github:` as a global package is broken.** Use the archive URL
above, not `npm install -g github:...`.

## Repository layout

```
apps/server      Fastify API, council engine, SQLite persistence
apps/web         Next.js chamber UI (static export, served by the API process)
packages/shared  zod schemas and types shared across both apps
docs/            architecture, roadmap, API reference
```

`apps/server/dist/` (the esbuild bundles plus the static UI) and
`packages/shared/dist/` are committed build output on purpose. That is what
lets `npm install` from git skip compiling Next.js, and what the server
typechecks against. Regenerate both with `npm run build`.

## Development

```bash
npm run dev         # API + chamber UI
npm test            # vitest suite
npm run typecheck   # strict TS across the monorepo
npm run lint        # eslint
npm run format      # prettier --write
npm run build       # shared -> server -> web
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and
[SECURITY.md](SECURITY.md) for the threat model and how to report a
vulnerability. Architecture notes live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security notes

- Provider keys are encrypted at rest. The API never returns them, only a
  `hasApiKey` flag.
- The server binds `127.0.0.1` by default. If you expose it, put it behind a
  reverse proxy with authentication. OpenCouncil has no built-in multi-user
  auth yet (see the roadmap).
- No telemetry. Outbound requests go only to the provider base URLs you
  configure, plus the research backends you enable (or the public DuckDuckGo
  / Wikipedia fallback).
- Configuration exports contain secret-presence metadata only, never raw
  provider keys. Importing a config never restores a secret.
- An attached workspace is read-only. Paths cannot escape the folder you
  pointed at. The process refuses to attach a filesystem root.

## License

MIT. Copyright 2026 Zeyad Gomaa.
