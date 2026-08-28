# Changelog

All notable changes to OpenCouncil are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Settings can pull live model availability and published $/MTok pricing from
  a provider (OpenRouter natively; OpenAI/Anthropic/Google/Groq/xAI/etc. via
  their model list APIs plus an OpenRouter price overlay).
- Council modes: swarm, critique, plus coding-decision modes — code review,
  architecture, and red team.
- Attach a local folder or files to a session. Agents get a tree briefing and
  sandboxed `list_dir` / `read_file` / `grep` tools (read-only, no writes).
- Web research pulls Wikipedia images and YouTube hits alongside page results.
- Brand mark: gold C sitting on the white O ring.

### Changed

- Chamber UI restyled to a Grok-like conversation layout: black canvas, white
  primary actions, slim sidebar with recent sessions, centered composer.
- Home empty state and live chamber now feel like a chat, not an admin dashboard.
- Long sessions keep older rounds collapsed and clamp very long messages so the
  chamber does not mount every markdown/mermaid block at once.
- Adding a provider opens the live catalog so you can enroll models immediately.

### Fixed

- Mermaid diagrams no longer dump "Syntax error in text / mermaid version …"
  into the page. Invalid LLM diagrams fall back to source; leftover error SVGs
  are suppressed.
- Web research actually has a working zero-config path: DuckDuckGo HTML/Lite,
  then Wikipedia. Round-robin members now receive that grounding.
- `prepare` is wired in `package.json`, so `npm install` in a clone is enough
  to produce a runnable `npx opencouncil` when artifacts are missing.
- Provider "Test" no longer uses `window.alert`.
- Settings tabs no longer clip the Councils tab; council cards cap the avatar
  row instead of overflowing.
- Pulling models (OpenRouter and others) no longer 404s with "no such API
  route". The static UI no longer registers a GET catch-all that swallowed
  `/api/v1/providers/:id/catalog`; the UI now POSTs `discover-models`. Restart
  the process after updating.

## [0.1.0] — 2026-08-27

First public release: a self-hosted, bring-your-own-key platform where several
LLMs convene as a council, deliberate over a question, and converge on an
answer while you watch the transcript live.

### Added

- SQLite persistence with embedded, automatically applied migrations.
- AES-256-GCM vault for provider API keys, encrypted at rest and never returned
  by the API.
- Provider adapters for OpenAI-compatible, Anthropic, and Google protocols,
  plus a mock adapter used by the seeded demo council.
- Council engine with `round_robin` and `debate` strategies, parallel member
  calls per round, and a moderator synthesis pass.
- Live chamber streaming over SSE with durable event IDs and `Last-Event-ID`
  replay.
- Session lifecycle: queue, run, cancel, clone, re-run, and export. Session
  snapshots stay readable after the council, member, model, or provider behind
  them is deleted.
- Usage metering per message — tokens, latency, and cost estimates — and an
  activity dashboard with daily series and per-member/model/provider breakdowns.
- Settings UI for providers, models, members, and councils, with config
  export/import that carries secret _presence_ only, never secrets.
- Headless CLI: `serve`, `doctor`, `provider`, `model`, `member`, `council`,
  `session`, and `usage`, with `--json` output for automation.
- Docker image and `docker-compose.yml` for container deployment.

### Fixed

- `.env` is now actually read. The README instructed operators to put
  `OPEN_COUNCIL_SECRET_KEY` there, but nothing loaded the file, so every stored
  provider key silently became unreadable on the next restart.
- `HOST` and `PORT` environment variables are honoured. The CLI overwrote both
  with its argv defaults before config was parsed, so `PORT=…` was ignored.
- `npm run dev` starts the API alongside the web dev server, and the UI proxies
  `/api/*` to it. Previously only Next.js started and every API call 404'd.
- The Docker build works: it targets Node 22 (required by `node:sqlite`), uses
  the root build instead of `npm -w` workspace commands that this repo has
  never had, and binds `0.0.0.0` so the published port is reachable.
- `POST /api/v1/config/import` validates its payload and returns 400 on
  malformed input instead of failing with an opaque 500.
- The `prepare` script is wired up again, so a source install without prebuilt
  artifacts builds itself.
- Install instructions point at the release archive URL. `npm install -g
github:…` symlinks the package into npm's cache temp directory, which npm
  later garbage-collects, breaking the command and poisoning later installs
  with `ENOTDIR`. Project-local git installs are unaffected.
- `/health` and `/system/info` report the real package version instead of a
  hardcoded string.

[0.1.0]: https://github.com/Zeyad-Gomaa/OpenCouncil/releases/tag/v0.1.0
