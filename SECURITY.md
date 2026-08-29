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
multi-user authorization.** Enable `OPEN_COUNCIL_OPERATOR_TOKEN` when the process is reachable by anyone else; it protects API routes, SSE, and downloads with an HttpOnly session cookie or bearer token.

The server binds `127.0.0.1` by default. Anyone who can reach the port can read
and change every council, member, provider, and session, and can spend money
against your configured API keys. If you expose it beyond localhost, put it
behind a reverse proxy that authenticates requests. Treat a report of
authentication bypasses or unsafe exposure as security issues rather
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
`OPEN_COUNCIL_SECRET_KEY`. If unset, OpenCouncil generates a random key and persists it as `.secret_key`
beside the database (mode 0600). An inability to persist that key produces a
startup warning and an ephemeral fallback. Back up the configured key or key
file with the database. Provider credentials are encrypted; transcripts, usage,
configuration, and workspace excerpts are stored as plaintext.

`.env` is gitignored. Keep it that way, and keep it out of any image you build.

## Browser and workspace boundaries

Cross-origin API calls from browsers are rejected using Fetch Metadata and an
Origin fallback. Reverse proxies should preserve Host; forwarded headers are not
trusted automatically. Native clients can omit these headers: this is browser
request protection around the optional authentication. Allowed-host validation blocks unconfigured hostnames; reverse proxies must preserve an allowed Host header.

Workspace reads canonicalize paths and reject external symlink targets. Tree
walks skip links, common credentials are blocked, and grep uses literal matching
to avoid model-generated regex denial of service. These controls do not detect
secrets embedded in ordinary source files, hard links, or hostile concurrent
filesystem changes. A pointed file shares its containing directory. Use a
separate, trusted checkout without secrets; the process is not an OS sandbox.

Web search sends the topic to external services by default. Turn it off in the
composer or enforce `WEB_RESEARCH_ENABLED=false`. Selected models still receive
the prompt, transcript, and attached excerpts. Remote Markdown images require
a click before loading and unsafe URL schemes are rejected. Prompt injection
is not solved by these controls.

Docker Compose binds the published port to loopback. The Docker ignore file
excludes local databases, environment files, keys, and dependency/build folders
from the build context. See [the audit](docs/AUDIT.md) for remaining limitations.
