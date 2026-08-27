# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub's
[security advisory form](https://github.com/Zeyad-Gomaa/OpenCouncil/security/advisories/new).
Include what you found, how to reproduce it, and the version or commit you
tested. You can expect an initial response within 7 days.

## Supported versions

OpenCouncil is pre-1.0. Fixes land on `main` and go out in the next release;
older tags are not backported.

## Threat model

OpenCouncil is **single-tenant, self-hosted software with no built-in
authentication.** It assumes one trusted operator on a trusted machine.

The server binds `127.0.0.1` by default. Anyone who can reach the port can read
and change every council, member, provider, and session, and can spend money
against your configured API keys. If you expose it beyond localhost, put it
behind a reverse proxy that authenticates requests. Treat a report of
"unauthenticated access when bound to 0.0.0.0" as working-as-documented rather
than a vulnerability — multi-user auth is on the roadmap.

Reports that are in scope include:

- Provider API keys recoverable from the API, logs, config exports, or session
  transcripts.
- Weaknesses in the AES-256-GCM vault or its key handling.
- Path traversal through the static UI handler.
- SQL injection, or crashes reachable from an unvalidated request payload.
- Anything causing outbound network requests to a host the operator did not
  configure.

## Protecting your keys

Provider API keys are encrypted at rest with AES-256-GCM using
`OPEN_COUNCIL_SECRET_KEY`. **Set it.** Without it, OpenCouncil generates an
ephemeral key at boot and every key you saved becomes unreadable after a
restart. Back it up together with `data/opencouncil.db` — the database is
useless without the key, and the key is useless without the database.

`.env` is gitignored. Keep it that way, and keep it out of any image you build.
