# Contributing to OpenCouncil

Thanks for wanting to help. OpenCouncil is a self-hosted, bring-your-own-key
platform, which shapes what a good contribution looks like: no telemetry, no
hosted services, no outbound calls to anything the operator did not configure.

## Getting set up

Node 22.5 or newer is required — persistence uses the built-in `node:sqlite`
module, so there is no native addon to compile.

```bash
git clone https://github.com/Zeyad-Gomaa/OpenCouncil.git
cd OpenCouncil
npm install
npm run build       # shared → server → web
npm run dev         # API on :4311, chamber UI on :3000
```

`npm run dev` builds the shared package and the server bundle, then runs the
API and `next dev` side by side. In dev the UI proxies `/api/*` to the API port
(see `apps/web/next.config.js`); in production both come from one origin.

Server source changes need `npm run build:server` to take effect — the dev API
process watches `apps/server/dist`, not `src`.

A demo council backed by the mock provider is seeded on first boot, so you can
exercise a full deliberation without any API keys.

## Before you open a pull request

```bash
npm run typecheck   # strict TS across shared, server, and web
npm test            # vitest
npm run lint        # eslint
npm run format      # prettier --write
npm run build       # must succeed; CI packs and smoke-tests the tarball
```

CI runs all of the above on Node 22 and 24, then installs the packed tarball
into a clean directory and checks that the CLI starts and the static UI shipped.

## Repository layout

```
apps/server        Fastify API + council engine + SQLite persistence
apps/web           Next.js chamber UI (static export)
packages/shared    zod schemas + types shared across both apps
docs/              architecture, roadmap, API reference
```

This is a plain monorepo, deliberately **not** npm workspaces. Module
resolution runs through TypeScript `paths` for typechecking, an esbuild
`--alias` for the server bundle, and Next's tsconfig-path support for the UI.
All runtime dependencies are declared in the root `package.json`.

Two directories are committed build output, on purpose:

- `apps/server/dist/` — the bundle plus the static UI, so that
  `npm install -g github:Zeyad-Gomaa/OpenCouncil` does not compile Next.js on a
  user's machine.
- `packages/shared/dist/` — the declarations `apps/server` typechecks against.

Regenerate both with `npm run build` and commit them with the change.

## Conventions

- Strict TypeScript. No `any` that a real type would cover.
- Validate every inbound payload at the API boundary with a zod schema from
  `packages/shared/src/schemas.ts`.
- Provider API keys are encrypted at rest and never leave the server. The API
  reports `hasApiKey`, never the key. Config exports carry secret _presence_
  only. Please keep it that way.
- Prefer self-documenting code; write a comment when the reason for something
  is not visible in the code itself.
- Add tests for new behaviour. The engine, strategies, vault, and config
  round-trip all have unit coverage to model after.

## Adding a provider adapter

Adapters live in `apps/server/src/providers/` and implement the interface in
`types.ts`. `mock.ts` is the smallest complete example. Register the adapter in
`registry.ts` and add its protocol to `providerProtocolSchema`. Adapters must
respect the caller's `timeoutMs` and surface token usage when the provider
reports it.

## Reporting bugs and requesting features

Open an issue. For anything security-related, follow [SECURITY.md](SECURITY.md)
instead of filing a public issue.
