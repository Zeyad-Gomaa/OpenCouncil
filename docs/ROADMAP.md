# OpenCouncil Roadmap

See [AUDIT.md](AUDIT.md) for evidence, risks, research sources, and acceptance
criteria. Priorities describe what should come next, not promised release dates.

## Implemented foundation

- [x] BYOK provider adapters and encrypted credential storage
- [x] Seven council strategies, moderator synthesis, workspace read tools
- [x] SQLite migrations, historical snapshots, durable session events
- [x] Headless commands, static UI packaging, Docker/Compose configuration
- [x] Cancellation, provider retry/backoff, per-provider concurrency
- [x] Research opt-out per session and server-wide policy
- [x] Workspace canonical-path checks and common credential protection
- [x] Browser-origin API guards, safe Markdown links, click-to-load images
- [x] Consistent UTC activity windows, unpriced-call warning, CSV export
- [x] SSE cursor deduplication, all-failed-session handling, disabled-model enforcement
- [x] Unit/API regressions, lint/typecheck/build, manual browser smoke verification

## Next: safety and operational correctness

- [ ] Upgrade unsupported Fastify/Next versions and complete a dependency advisory scan
- [x] Allowed-host validation, optional operator authentication, protected SSE/downloads
- [ ] Queue and round limits; estimated-cost reservations and explicit unknown-pricing policy
- [ ] Immutable execution plans, per-attempt usage accounting, strict provider response validation
- [ ] End-to-end research cancellation/deadlines and graceful shutdown
- [ ] Cross-process CLI cancellation and durable restart terminal events
- [ ] Atomic vault key creation/rotation and tested backup restoration
- [ ] Context fitting that preserves required instructions and the current question

## Then: better decisions and daily use

- [ ] Anonymized peer rankings and structured verdicts with dissent/uncertainty
- [ ] Source provenance and citation validation through synthesis
- [ ] Offline evaluation set comparing councils to individual models
- [ ] Token-level streaming with replay, retry, and cancellation semantics
- [ ] Explicit workspace file allowlists and stronger isolation for untrusted code
- [ ] Historical member/usage fidelity, stable pagination, retention and session deletion
- [ ] Accessible dialogs/forms, mobile checks, connection status, chart date labels
- [ ] Bundled Mermaid/fonts and a compatible Content Security Policy
- [ ] Non-root container, proxy example, container and package release smoke tests

## Later, when demand justifies the complexity

- Multi-user roles and SSO
- Strategy/plugin API with a defined trust boundary
- Webhooks with signing/retry controls
- Postgres, multi-instance scheduling, Helm
- i18n and a packaged desktop application
