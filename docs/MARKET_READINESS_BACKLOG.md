# OpenCouncil: implementation backlog for open-source readiness

**Date:** 15 September 2026 · **Baseline:** `a36f04a`

Read [the adoption and readiness assessment](MARKET_READINESS.md) for the recommended users, research into alternatives, verified failures, evaluation plan, and release gates.

**Project constraint:** OpenCouncil and all proposed features remain free and open source. There are no application subscriptions, paid tiers, or billing requirements. Usage controls protect users’ own provider budgets and hardware resources. The review workflow is a proposed flagship example; community feedback can favor other existing council workflows.

This is a list of material changes identified in this review, not a guarantee that every future defect or requirement has been discovered. Items are proposed and have not been implemented by this research task. Acceptance criteria describe the intended behavior.

## Priorities and dependencies

- **P0:** establish correctness and data controls before using real private repositories in unattended sessions.
- **P1:** make the local application useful, accessible, and maintainable for a dependable open-source release.
- **P2:** add when concrete community needs justify a shared-instance or integration capability; required controls must ship with that capability. These are not prerequisites for single-operator local use.
- **S:** approximately 1–3 engineering days. **M:** approximately 4–7 days. **L:** approximately 2–3 weeks. Estimates are rough, overlap, and exclude time waiting for volunteer feedback; do not sum them into a promised delivery date.

Critical dependencies: outcome contract → attempt ledger and immutable inputs → evidence/finding schema → useful workflows and result UI → evaluation → selective optimization. Contributor support and reliable releases proceed alongside this work; optional shared-instance features follow demonstrated use.

## A. Correctness, security boundaries, and execution

### OC-01 · P0 · M — Make completion mean a usable result exists

**Current:** the runner tolerates member errors, including the final moderator error, then marks the session completed. An isolated probe produced `completed` with no synthesis.

**Change:** define required stages and artifacts per workflow; distinguish complete, partial, cancelled, and failed outcomes. Preserve successful work and give a clear failure reason. Retry a failed synthesis using saved evidence without rerunning all reviewers.

**Accept:** an expected but failed/missing/invalid final artifact cannot yield an unqualified successful review. Fixtures cover partial reviewer failure, all reviewers failed, moderator failure, budget stop, and cancellation at each stage. “No verified findings” differs from “review incomplete.”

**Code:** [runner.ts](../apps/server/src/engine/runner.ts), [domain types](../packages/shared/src/domain.ts), [chamber](../apps/web/app/sessions/view/page.tsx).

### OC-02 · P0 · L — Introduce an attempt-level usage ledger

**Current:** usage accumulates in memory until a member turn completes; null quantities become zero. Earlier successful tool calls disappear if a later call fails. Peer-review calls record zero latency and do not emit the same live usage events as member calls.

**Change:** create a durable attempt record before dispatch. Record session/stage/member/model/provider, attempt and hop numbers, timestamps, response ID, reported and unknown token fields, cache/reasoning metadata, estimated cost, reported cost, pricing source/version, and terminal reason. Link messages to attempts. Keep transport retry and logical stage retry separate.

**Accept:** every dispatch is accounted for after success, error, cancellation, retry, and restart. Synthetic successful-hop-then-failure costs remain visible. Null usage stays null. Dashboard, session totals, SSE, and exports agree; unknown charges remain visibly uncertain.

**Code:** [runner.ts](../apps/server/src/engine/runner.ts), [database](../apps/server/src/db/connection.ts), [activity](../apps/server/src/routes/activity.ts), [provider types](../apps/server/src/providers/types.ts).

### OC-03 · P0 · M — Preserve the task and required instructions through tool hops

**Current:** `fitMessages` treats the last non-system message as the task. After a tool hop this is tool output; the original question can be dropped. Required system text can also be clipped.

**Change:** track operator task, constraints, directives, tool results, and peer evidence as typed context. Reserve the non-negotiable instruction/task budget explicitly. Summarize or remove supporting evidence first; reject an impossible context budget instead of truncating critical instructions silently. Respect provider message overhead and tokenizer differences.

**Accept:** constrained-window tests retain the original task after multiple hops and keep tool text untrusted. Include Unicode, long constraints, oversized tool results, and context windows smaller than the reserved response. Report omitted evidence and incomplete coverage.

**Code:** [context-budgeter.ts](../apps/server/src/engine/context-budgeter.ts), [prompts.ts](../apps/server/src/engine/prompts.ts), [runner.ts](../apps/server/src/engine/runner.ts).

### OC-04 · P0 · L — Capture a versioned execution plan

**Current:** historical snapshots are descriptive; queued and running work consults live model/provider configuration. Source files can also change during review.

**Change:** capture workflow/prompt version, model IDs and capabilities, sampling/limits, prices, file/revision hashes, evidence policy, and participating roles before dispatch. Store secret references rather than raw keys. Define cancellation/revocation behavior for disabled providers and rotated credentials. Label reruns as the same captured inputs or a new revision/current configuration.

**Accept:** editing/deleting a council or changing model settings cannot silently change already-queued review inputs. Source changes produce a new review version. Secrets remain absent from snapshots and exports. Exact output reproducibility is not promised for nondeterministic providers.

**Code:** [session snapshots](../apps/server/src/routes/sessions.ts), [DB helpers](../apps/server/src/app.ts), [runner.ts](../apps/server/src/engine/runner.ts).

### OC-05 · P0 · L — Enforce workspace scope

**Current:** one selected file authorizes its parent directory; preferred files are not an allowlist. Real-path checks and sensitive-path filtering are already present.

**Change:** use an explicit file manifest shared by briefing, list, read, and search tools. Offer a preview of outbound snippets. Expansion must be intentional. For untrusted repositories, use an isolated read-only snapshot/mount; account for races, hard links, oversized trees, and custom ignore policy. Add secret-pattern detection with a documented escape process; filtering alone is not a complete secret guarantee.

**Accept:** selecting a file makes an unselected sibling unreadable. Tests include symlink/hard-link/race scenarios appropriate to the chosen isolation mechanism, secrets in ordinary source files, and unsupported file types. New context expansion is visible before transmission.

**Code:** [workspace.ts](../apps/server/src/engine/workspace.ts), [preview/session routes](../apps/server/src/routes/sessions.ts), [composer](../apps/web/app/page.tsx).

### OC-06 · P0 · M — Add a coherent outbound-data policy

**Current:** research defaults on; model-requested search can send derived queries to search providers. Catalog overlays and Mermaid are additional network paths. Self-hosting does not keep remote inference inputs local.

**Change:** private-code workflows default to research off. Preview chosen providers and permitted external services, constrain generated search queries, and apply the policy to model calls, search, catalogs, assets, and logs. Local-only mode must disable all optional external traffic. If URL fetching is added, enforce destination, redirect, IP, size, and timeout rules; allow private/local model endpoints only through an explicit deployment policy.

**Accept:** network-recording tests show zero external calls in local-only mode, including discovery and diagrams. Synthetic secret canaries cannot enter search queries. Provider retention/routing requirements are visible before a real review. No privacy guarantee is inferred just from BYOK.

**Code:** [config](../apps/server/src/config.ts), [web search](../apps/server/src/engine/web-search.ts), [catalog](../apps/server/src/providers/catalog.ts), [workspace tools](../apps/server/src/engine/workspace.ts).

The security design should treat model text as untrusted and enforce permissions outside prompts. [OWASP prompt-injection prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

### OC-07 · P0 · M — Make cancellation and deadlines end-to-end

**Current:** provider HTTP supports cancellation, but research lacks a session signal; search response bodies outlive the helper's timeout. Semaphore waits are not individually abortable.

**Change:** propagate one cancellation/deadline context through all searches, body reads, retries, queue waits, tools, and synthesis. Bound response bytes and cumulative research time; cancel sibling work on terminal policy failures. Separate user cancellation from provider timeout diagnostics.

**Accept:** stalled response bodies terminate; cancelling during research or queue wait causes no later dispatch. Deadline expiry persists a partial/failed result with known usage. Test this with controlled local HTTP fixtures.

**Code:** [web-search.ts](../apps/server/src/engine/web-search.ts), [HTTP helper](../apps/server/src/lib/http.ts), [execution policy](../apps/server/src/engine/execution-policy.ts), [runner.ts](../apps/server/src/engine/runner.ts).

### OC-08 · P0 · L — Coordinate process ownership, recovery, and idempotency

**Current:** the queue/controllers live in memory; CLI cancellation updates a row without cancelling another process. Startup recovery marks queued/running rows failed without terminal event replay. Multiple processes can share a database without an ownership contract.

**Change:** choose one orchestrator per database initially and enforce it, or introduce durable job ownership/leases. Route CLI control to the owner. Add idempotency keys for run creation and delivery deduplication. On SIGTERM/SIGINT, stop admitting work, drain or abort to a deadline, flush accounting, publish terminal states, and close cleanly. Persist new event sequences safely across recovery.

**Accept:** a second server cannot fail or duplicate the first server's live work. CLI cancel halts the active run. Restarted queued/running sessions reach an explainable terminal or safely resumed state without accidental repeated provider charges or local computation. Repeated create requests cannot create duplicate work.

**Code:** [session manager](../apps/server/src/engine/session-manager.ts), [CLI](../apps/server/src/cli.ts), [startup recovery](../apps/server/src/db/connection.ts), [event bus](../apps/server/src/engine/bus.ts).

### OC-09 · P0 · M — Make vault recovery and backups reliable

**Current:** key creation uses check/read/write with replacement and ephemeral fallback possibilities.

**Change:** exclusive creation, strict key validation, atomic rotation with old/new key IDs, and a fail-closed recovery mode for unreadable or invalid existing key material. Provide a consistent SQLite backup procedure covering WAL state and the matching key; keep the supplied stop-before-copy procedure until online backups are implemented.

**Accept:** two first starts cannot create incompatible keys; permission errors do not replace a key or accept unpersistable credentials. A fresh-instance restore recovers configuration, transcripts, and usable encrypted credentials. Document key loss separately from database loss.

**Code:** [config.ts](../apps/server/src/config.ts), [vault](../apps/server/src/vault/crypto.ts), [database](../apps/server/src/db/connection.ts), [README](../README.md).

## B. The focused review product

### OC-10 · P1 · S — Replace mechanism-first positioning

Lead Home and the README with useful tasks, intended users, and a complete example. Offer **Review a change** as a flagship workflow, while keeping general councils and architecture review available. Put detailed configuration in advanced settings. Correct stale roadmap, audit follow-up, architecture, and security claims. Explain the free/open-source policy and local-model/BYOK setup.

**Accept:** a new user can identify the intended task, required inputs, output, and data destination without learning “members” or “strategies.” Existing features are accurately marked implemented. Validate workflow choices with users before expanding scope.

**Code:** [Home](../apps/web/app/page.tsx), [templates](../packages/shared/src/templates.ts), [README](../README.md), [roadmap](ROADMAP.md).

### OC-11 · P1 · L — Add a versioned review artifact schema

Store structured findings with ID, severity, category, file/revision/line span, trigger, impact, evidence references, proposed fix, verification status, dissent, and uncertainty. Store coverage and skipped checks separately. Keep a prose summary for readability. Schema validation must not manufacture missing facts.

**Accept:** malformed output is repaired within a budget or marked incomplete. Unsupported concerns cannot silently become verified blockers. Human disposition and release decisions have separate fields and actors.

**Code:** [shared schemas](../packages/shared/src/schemas.ts), [domain](../packages/shared/src/domain.ts), [moderator](../apps/server/src/engine/moderator.ts), [database](../apps/server/src/db/connection.ts).

### OC-12 · P1 · L — Ingest the actual change and pin its revision

Add local Git base/head and working-tree patch ingestion, plus a bounded patch/design-note input. Capture the intended behavior, constraints, changed files, relevant tests, and source hashes. Define behavior for untracked/deleted/renamed files and dirty worktrees. Start with local ingestion before building a hosted GitHub App.

**Accept:** a review clearly states the exact change reviewed; line locations remain valid against its snapshot; unchanged context is retrieved deliberately. The user need not paste an absolute directory path and hope the models find the change.

**Code:** [session routes](../apps/server/src/routes/sessions.ts), [workspace](../apps/server/src/engine/workspace.ts), [Home](../apps/web/app/page.tsx); new ingestion module.

### OC-13 · P1 · L — Capture evidence and validate references

Create evidence records containing file hash/line span or URL, retrieved time, excerpt, and source identity. Bind findings and synthesis claims to these records. If external research is used, retrieve enough primary content to support a claim, distinguish snippets from inspected pages, deduplicate sources, and apply OC-06 controls.

**Accept:** nonexistent lines/URLs and mismatched excerpts are detected. Exports include evidence and coverage. Reference existence does not imply factual support; semantic verification and human review remain distinct checks.

**Code:** [web search](../apps/server/src/engine/web-search.ts), [workspace](../apps/server/src/engine/workspace.ts), [moderator](../apps/server/src/engine/moderator.ts), [schemas](../packages/shared/src/schemas.ts).

### OC-14 · P1 · M — Retrieve relevant code efficiently

Replace the first-files briefing with diff-aware retrieval of changed symbols, callers, tests, configuration, and declared constraints. Record missing/omitted context. Use safe, explicit policies for relevant hidden paths such as `.github/workflows`; blanket hidden-file exclusion can miss deployment behavior. Move expensive synchronous filesystem work into a bounded worker if profiling demonstrates API stalls.

**Accept:** seeded defects outside the first alphabetical files are reachable; large repositories do not silently appear fully reviewed. Retrieval quality and time are measured on representative repositories before adding embeddings or a vector database.

**Code:** [workspace.ts](../apps/server/src/engine/workspace.ts), especially `listTree`, `buildWorkspaceBriefing`, and `grep`.

### OC-15 · P1 · M — Reduce onboarding to one successful review

Provide a short wizard: choose remote/local model setup → verify provider → select tested review preset → preview data/budget → run sample or real change. Create required members/council automatically. Handle insufficient credits, unavailable models, missing local runtime, missing prices, and incompatible parameters explicitly.

**Accept:** 8/10 target users reach a real review without assistance within the proposed five-minute activation target, excluding a model download. Any connection check that consumes remote-provider credits makes that clear. Document a local-model setup that needs no provider account. Advanced configuration remains editable.

**Code:** [settings](../apps/web/app/settings/page.tsx), [catalog picker](../apps/web/app/components/CatalogPicker.tsx), [provider routes](../apps/server/src/routes/providers.ts), [templates](../packages/shared/src/templates.ts).

### OC-16 · P1 · S — Replace the misleading demo output

Label demo mode in the composer, result, and exported metadata. Supply a small synthetic code change with coherent predefined findings, evidence, and a limitation notice. Update mock parsing to match the prompt contract; do not render internal tags as sample reasoning. Distinguish known-free simulated cost from unknown real-provider cost.

**Accept:** first run demonstrates the real intended artifact without XML/prompt fragments, claims of live reasoning, or unexplained unknown-charge warnings.

**Code:** [mock adapter](../apps/server/src/providers/mock.ts), [demo seed](../apps/server/src/db/seed.ts), [Home](../apps/web/app/page.tsx), [chamber](../apps/web/app/sessions/view/page.tsx).

### OC-17 · P1 · M — Build a decision-oriented results screen

Put the outcome, actionable findings, supporting evidence, coverage, cost, and uncertainty first. Allow expansion of reasoning and transcript. Show file/line previews, disagreements, incomplete stages, and the next available action. Use explicit partial/cancelled/budget-stopped labels.

**Accept:** users can identify what needs fixing and why without reading the debate. Large transcripts do not block navigation or force auto-scroll away from a finding being read.

**Code:** [chamber](../apps/web/app/sessions/view/page.tsx), [Markdown renderer](../apps/web/app/components/MarkdownRenderer.tsx).

### OC-18 · P1 · M — Add finding resolution and revision comparison

Support accepted/rejected/resolved/needs-investigation states with reasons, stable fingerprints, and links to the fixing revision. Show new, persistent, and resolved findings after rerun. Preserve prior evidence and allow explicit correction of an earlier review.

**Accept:** a revised patch does not create a completely disconnected review; verified feedback can inform evaluation without treating every user rejection as ground truth.

**Code:** [session routes](../apps/server/src/routes/sessions.ts), [database](../apps/server/src/db/connection.ts), [chamber](../apps/web/app/sessions/view/page.tsx).

### OC-19 · P1 · M — Make exports useful and complete

Expose the existing export capability in the result UI and extend it with the review artifact, evidence manifest, execution-plan version, usage/unknown charges, coverage, and human dispositions. Support Markdown and versioned JSON first. Add redacted export and portable paths; keep provider credentials excluded. Consider SARIF only when an integration requires it.

**Accept:** another engineer can interpret an exported review without the original running server. Exported schema is validated and compatible with documented versions; private file paths and excerpts follow the selected redaction policy.

**Code:** [exports](../apps/server/src/routes/sessions.ts), [configuration export](../apps/server/src/routes/config.ts), [chamber](../apps/web/app/sessions/view/page.tsx).

### OC-20 · P1 · M — Fix history retrieval and retention

Use `(created_at, id)` keyset pagination, expose pagination in the UI, and search server-side across stored review/council metadata. The current UI loads 200 sessions and filters only that set. Add session deletion and a documented retention policy, including messages, events, attempts, evidence, and backups. Prefer recoverable deletion where feasible.

**Accept:** same-timestamp records are not skipped; older sessions are reachable/searchable after council deletion; deletion covers all intended records and accurately explains backup retention. Add indexes based on query plans at representative history sizes.

**Code:** [session routes](../apps/server/src/routes/sessions.ts), [history](../apps/web/app/sessions/page.tsx), [database](../apps/server/src/db/connection.ts).

### OC-21 · P1 · M — Preserve historical display fidelity

Render members, model names, colors, verdicts, and stage states from saved review data. Link persisted message usage to the attempt ledger. A current council edit must not relabel a historical review.

**Accept:** live, reload, rerun, and exported records agree. A completed session does not initialize its member rail as queued, and deleting configuration does not remove historical identities.

**Code:** [chamber boot](../apps/web/app/sessions/view/page.tsx), [mappers](../apps/server/src/routes/mappers.ts), [session routes](../apps/server/src/routes/sessions.ts).

### OC-22 · P1 · M — Complete accessibility and recovery UX

Give dialogs proper semantics, title association, initial focus, focus containment/restoration, and keyboard dismissal. Associate form labels; communicate errors and loading changes accessibly. Preserve form input after errors. Audit contrast and keyboard interactions in the transcript, settings, and code previews; check desktop and small screens.

**Accept:** keyboard users complete onboarding and review without losing focus behind a modal; a screen reader identifies controls and result status. Add focused automated browser checks plus manual keyboard review. The inspected small-screen settings view already lays out usefully; a complete redesign is not justified by that smoke test.

**Code:** [Modal](../apps/web/app/components/Modal.tsx), [settings](../apps/web/app/settings/page.tsx), [global CSS](../apps/web/app/globals.css).

## C. Quality, cost, and operations

### OC-23 · P1 · L — Introduce model capability contracts

The common adapter sends generic sampling/max-token parameters and returns text plus basic usage. Add validated capability metadata for parameter names, reasoning controls, output limits, structured output, tool use, streaming, and cache accounting. Support native tool calls where available; keep text-tool fallback explicit. Validate response bodies instead of trusting TypeScript casts. Preserve refusals and truncation as result states. Paginate provider catalogs and record pricing/context provenance rather than assuming every catalog is exhaustive or every model has the same context size.

**Accept:** a small documented provider/model support matrix passes contract fixtures and opt-in live canaries. Unsupported parameters and malformed/negative usage produce clear failures. Connection success alone does not label a model review-compatible.

**Code:** [provider adapters](../apps/server/src/providers/types.ts), [OpenAI-compatible adapter](../apps/server/src/providers/openai-compatible.ts), [catalog](../apps/server/src/providers/catalog.ts), [HTTP helper](../apps/server/src/lib/http.ts).

### OC-24 · P1 · M — Make cost controls accurate and understandable

Keep existing pre-dispatch reservations. Distinguish reserved, settled, estimated, and unknown spend. Do not retain every fully known successful reservation forever if a safe reconciliation policy can release unused capacity; retain uncertainty for possibly billed failed attempts. Include search/tool charges where applicable, pricing age, cache/reasoning charges, and a synthesis allowance. Define account/provider/project caps as additional policy layers.

**Accept:** parallel dispatch cannot exceed the local reservation policy; uncertain billing is never silently released; known settlements reconcile consistently. Preflight explains unknown prices before starting work. The UI never represents a local estimate as a provider-enforced billing guarantee.

**Code:** [spending budget](../apps/server/src/engine/spending-budget.ts), [catalog pricing](../apps/server/src/providers/catalog.ts), [composer](../apps/web/app/page.tsx). Depends on OC-02.

### OC-25 · P1 · L — Build quality evaluation and regression gates

Implement the stratified benchmark and baselines in the readiness assessment. Include reproducible local-model configurations so contributors can participate without remote-provider credits. Track finding precision/recall, unsupported claims, leakage, minority findings, cost per useful finding, and latency. Version the model/prompt/workflow combination and store raw outcomes. Include prompt-injected source files, false consensus, unavailable tools, and a correct dissenting model.

**Accept:** a new workflow/model is promoted based on held-out results and human-reviewed evidence. Results disclose sample size, uncertainty, and cost. Do not market a multi-model accuracy advantage until the benchmark supports it.

**Code:** new evaluation harness/dataset; [strategies](../apps/server/src/engine/strategies.ts), [prompts](../apps/server/src/engine/prompts.ts), [existing tests](../apps/server/src/tests/council.e2e.test.ts).

### OC-26 · P1 · M — Reduce bias in peer evaluation

Current candidates retain stable ordering, and all members review all candidates including their own. Randomize order and labels per ballot with a saved mapping, measure self-preference, consider independent verifiers or self-exclusion, and define minimum coverage. Keep disagreement and preference scores separate from factual confidence. Evaluate findings individually, not just entire answer rankings.

**Accept:** order permutations do not materially swing chosen findings on the held-out set; invalid ballots and low coverage are visible; a well-supported minority defect survives majority disagreement. If ranking adds no value, make it optional or remove it from the default workflow.

**Code:** [consensus](../apps/server/src/engine/consensus.ts), [runner evaluation stage](../apps/server/src/engine/runner.ts), [evaluation types](../packages/shared/src/evaluation.ts).

### OC-27 · P1 · L — Optimize calls, retrieval, and context based on evidence

Add quick/standard/deep policies with explicit budgets. Prefer independent first passes and targeted verification of important disputed findings. Reuse evidence by immutable source hash, apply policy-scoped search caching, preserve provider prompt-cache support, and stop when required checks are satisfied. Make concurrency configurable by provider quota and workload.

**Accept:** compare quality, dollar cost, and p50/p95 time before/after each optimization. Meet the defined review fixture target or explain provider-bound latency. Quality must not regress just to reduce token counts; equivalent cheaper single-model execution is an acceptable outcome.

**Code:** [strategies](../apps/server/src/engine/strategies.ts), [runner](../apps/server/src/engine/runner.ts), [workspace](../apps/server/src/engine/workspace.ts), [execution policy](../apps/server/src/engine/execution-policy.ts). Depends on OC-25.

### OC-28 · P1 · M — Add reliable progress and streaming semantics

Show queue/stage/connectivity and remaining policy budget. Add token deltas only with attempt IDs, durable ordering, retry replacement rules, and a distinct final-message commit. Bound replay batches and respect slow-client backpressure; clean up heartbeat/subscription resources. Keep retained events and live messages consistent.

**Accept:** reconnecting clients do not double-count usage or combine partial text from failed retries. Slow clients cannot grow memory unboundedly, and partial output cannot be mistaken for the final review. Cancellation stops streaming predictably.

**Code:** [bus](../apps/server/src/engine/bus.ts), [SSE route](../apps/server/src/routes/sessions.ts), [event cursor](../apps/web/app/lib/eventCursor.ts), [chamber](../apps/web/app/sessions/view/page.tsx).

### OC-29 · P1 · M — Bundle assets and tighten output rendering

Bundle a reviewed Mermaid version locally, replace dynamic `new Function` module loading, and add a compatible Content Security Policy. Review SVG/Markdown rendering and preserve safe links/click-to-load external images. Bound diagram complexity and render time.

**Accept:** diagrams work without CDN access, restrictive CSP does not require unsafe evaluation, and adversarial Markdown/diagrams do not execute script, navigate unexpectedly, or freeze the UI. Existing sanitization stays covered by tests.

**Code:** [MermaidDiagram](../apps/web/app/components/MermaidDiagram.tsx), [sanitizer](../apps/web/app/lib/sanitizeMermaid.ts), [MarkdownRenderer](../apps/web/app/components/MarkdownRenderer.tsx), [app headers](../apps/server/src/app.ts).

### OC-30 · P1 · M — Finish release and dependency hygiene

Migrate Vitest to a patched supported version while fixing the known workspace/TSX compatibility obstacle. Add scheduled dependency/advisory checks, artifact provenance/checksums, and a build dependency inventory that includes libraries bundled into the server/UI. Test clean archive/npm/container installation, first boot, authenticated session flow, upgrade, and restore. Verify the exact documented minimum Node version or raise it. Add automated browser coverage for the advertised flow and a release check for the committed UI, which CI currently excludes from byte-for-byte comparison.

**Accept:** consumers can install a tagged artifact into a clean environment and complete a mock review. Source and shipped artifacts identify the same revision. Known advisories are fixed or explicitly assessed for exposure. Non-root container startup and volume upgrades pass; do not reimplement the existing `USER node` and healthcheck.

**Code:** [package manifest](../package.json), [CI](../.github/workflows/ci.yml), [Dockerfile](../Dockerfile), [build scripts](../scripts/prepare.js). [Vitest advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).

### OC-31 · P1 · M — Add operational diagnostics and bounded resource policies

Expose queue delay, stage duration, attempt/retry counts, event-loop delay, DB growth, provider failures, unknown charges, and completion rates. Bound session lifetime, evidence sizes, replay volume, and stored history. Make structured logs redact prompts/keys by default. Add a diagnostics export suitable for support and document proxy/TLS setup.

**Accept:** a stalled review can be attributed to queue, retrieval, provider, or synthesis without exposing private source. Representative concurrent reviews and long histories have recorded latency/memory/DB measurements. A healthcheck distinguishes liveness from readiness where necessary.

**Code:** [app](../apps/server/src/app.ts), [activity](../apps/server/src/routes/activity.ts), [execution policy](../apps/server/src/engine/execution-policy.ts), [database](../apps/server/src/db/connection.ts).

### OC-32 · P1 · M — Measure adoption without collecting private work

Define first successful setup/session, completed/partial review, export, accepted/rejected finding, repeat session, and verified fix events. Keep diagnostics local by default; any external telemetry is optional, opt-in, and excludes prompts, source, keys, and sensitive identifiers. Use voluntary tester feedback and reproducible issues to understand adoption without requiring centralized user tracking.

**Accept:** voluntary testing establishes whether users can install the app, obtain a useful result, return, and report problems maintainers can reproduce. Track contribution friction and support burden. Stars, downloads, demo sessions, and token volume do not substitute for useful sessions.

**Code:** [activity](../apps/server/src/routes/activity.ts), [database](../apps/server/src/db/connection.ts), [result UI](../apps/web/app/sessions/view/page.tsx); new product-metrics definitions.

## D. Community maintenance and optional integrations

### OC-33 · P2 · L — Add individual identities and project authorization

Required if multi-user shared instances are supported: user accounts, team/project ownership, scoped roles, membership revocation, scoped API credentials, and an audit trail of actor/action/resource. Authorize every session, evidence read, export, provider change, and SSE connection. Shared operator-token access is not individual accountability. Add SSO only when actual community deployments require it. All such features remain free and open source.

**Accept:** isolation tests cannot cross users/projects/tenants; revocation ends protected live access; provider keys are restricted to the intended scope. No workspace path grants access outside a user's approved roots.

### OC-34 · P2 · L — Integrate GitHub with narrow permissions

Create a GitHub App or documented local/CI integration for diff ingestion and review artifacts. Pin base/head revisions, verify webhook signatures, deduplicate delivery IDs, cancel superseded reviews, and avoid duplicate comments. Use minimum repository permissions and a separate explicit policy for posting. Do not execute untrusted PR code with installation secrets. Start with a check summary and links before many inline comments.

**Accept:** duplicate/reordered/forged deliveries cannot create unintended runs or spend; fork PRs cannot expose secrets; posted findings match the reviewed commit. Removing an installation revokes access. [GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).

Depends on OC-04, OC-11–13, OC-18, and the authorization appropriate to the deployment.

### OC-35 · P2 · M — Expose a bounded CLI/MCP review workflow if users need it

Extend the existing CLI with revision/workspace/depth/budget controls and a stable result schema. Add local MCP review/status/cancel/export tools only if pilot users want them. Constrain allowed roots, session budgets, and transport authentication; a tool caller must not gain arbitrary filesystem authority or spend through implicit defaults.

**Accept:** a coding assistant can request a review and retrieve a structured artifact without duplicating configuration or silently expanding permissions. Cancellation and provider-usage accounting work through the same orchestrator. Use the current MCP security/authorization requirements for any network transport. [MCP security guidance](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/tutorials/security/security_best_practices.mdx).

### OC-36 · P1 · M — Make contribution and maintenance approachable

Build on the existing CONTRIBUTING, SECURITY, issue templates, and CI. Add a short architecture/contribution tour, reproducible local development and mock-test instructions, documented extension points, a supported-model matrix, small starter issues, and clear triage/review expectations. Keep all application features MIT-licensed and free. Document maintainer capacity and avoid promising response times the project cannot sustain.

**Accept:** a new contributor can run the app and tests without remote-provider credits, reproduce a sample issue, and identify where to make a focused fix. Maintainers can reproduce bug reports without requesting private keys/source. Contribution instructions match the shipped scripts and directory structure.

### OC-37 · P2 · M — Document safe shared-instance deployment

If users deploy a shared or remotely accessible instance, document data destinations, retention/deletion, source-consent policy, encrypted volumes, key separation, backup location, restore procedures, and vulnerability handling. Use TLS for remote access. Restrict provider base URLs and repository processing against cross-user filesystem access and network pivoting. These are deployment controls, not a requirement to operate a hosted service.

**Accept:** operators and users can understand where code goes, who can read it, how it is deleted, and how it is restored. Restore and user-isolation checks pass for the documented deployment. Local-only users do not have to provision cloud infrastructure or organizational identity services.

### OC-38 · P2 · L — Scale only after workload measurements justify it

Profile real concurrent usage first. If multiple workers are required, add durable scheduling, transactional ownership/leases, distributed budget/concurrency controls, shared events, and operational recovery. Evaluate Postgres based on write contention and access patterns. Add container orchestration only for an actual deployment requirement.

**Accept:** a defined load profile meets latency, resource, failure recovery, and cost targets without duplicated execution. A database migration alone is not considered a scalability solution.

### OC-39 · P1 · M — Publish an approachable open-source release

Publish a concise project page/README, complete workflow demo, supported model/runtime matrix, reproducible benchmark methodology, sample redacted review, installation/upgrade docs, limitations, community support channels, and release notes. Include a useful offline demo, a local-model recipe, and a clear path from user to contributor. Keep feature and quality claims synchronized with measured results.

**Accept:** volunteer testers can install a tagged release, complete a useful task, understand data/resource use, and file an actionable issue. Use repeat-session and contribution feedback to choose the next release's priorities. No signup, payment, or subscription is required by OpenCouncil.

## Deliberately outside the initial scope

More debate strategies, a general plugin marketplace, automatic fixes/merges, arbitrary code execution, autonomous security certification, broad document/media ingestion, internationalization, a desktop wrapper, enterprise SSO, and Kubernetes are not initial requirements. Revisit each only when community evidence and its associated safety/operational work justify the additional scope.
