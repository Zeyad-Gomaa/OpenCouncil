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

The postinstall step compiles everything; `opencouncil` then serves API + UI on one port (default 4311).

**Run without installing globally:**

```bash
git clone https://github.com/Zeyad-Gomaa/OpenCouncil.git
cd OpenCouncil && npm install && npm run build
npm start                 # or: npx opencouncil
```

**Development mode** (watch rebuilds, separate web port):

```bash
npm install
npm run dev               # server :4311, web :3000
```

Open http://localhost:4311 (or :3000 in dev mode). A demo council of mock
members is seeded on first boot so you can watch a full deliberation
immediately without any API keys.

For real deliberations:

```bash
cp .env.example .env
# set OPEN_COUNCIL_SECRET_KEY (required to persist provider keys across restarts)
# Settings → Providers → add your provider + key
```

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
apps/server    Fastify API + council engine + SQLite persistence
apps/web       Next.js chamber UI
packages/shared  zod schemas + types shared across both apps
docs/          architecture, roadmap, API reference
```

## Development

```bash
npm run dev         # all three packages, concurrently
npm test            # vitest suite
npm run typecheck   # strict TS across the monorepo
npm run build       # shared → server → web
```

Environment: see `.env.example`. Node ≥ 20.

## Security notes

- Provider keys are encrypted at rest; the API never returns them, only a
  `hasApiKey` flag.
- Server binds `127.0.0.1` by default. If you expose it, put it behind a
  reverse proxy with authentication — OpenCouncil has no built-in multi-user
  auth yet (see roadmap).
- No telemetry. Outbound requests go only to the provider base URLs you
  configure.

## License

MIT © 2026 Zeyad Gomaa
