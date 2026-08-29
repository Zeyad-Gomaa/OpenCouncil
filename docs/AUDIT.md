# OpenCouncil audit — 2026-08-29

Baseline: `d8c3394` (package version 0.4.0). This report covers source, local
behavior, packaging, tests, security boundaries, product gaps, and primary-source
research. It is a project audit, not a penetration-test certification or a claim
that all vulnerabilities have been found. No production data or paid provider
keys were used. Changes were verified against isolated mock councils.

## Assessment

The project already offers more than a minimal council demo: seven strategies,
multiple provider protocols, SQLite migrations, encrypted provider credentials,
headless commands, workspace tools, durable SSE events, exports, and a settings UI.
The best next investment is making these capabilities safe, predictable, and
observable before adding more orchestration modes.

The initial checks passed: **85 tests across 15 files**, strict typechecking, and
ESLint. However, tests accepted any 4xx/5xx response for invalid input, did not
exercise symlink escapes or real provider HTTP cancellation, and did not catch
inconsistent activity windows. Passing tests did not establish those guarantees.

## Implemented in this patch

Priority describes the original problem: P1 = security or significant correctness;
P2 = reliability or user-facing gap. Source paths are relative to the repository.

| Priority | Finding                                                                                                             | Change and evidence                                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | `engine/workspace.ts` checked lexical paths only; symlinked files/directories could escape the attachment.          | Canonical root/target containment, link-free tree traversal, root-alias rejection. Tests cover external links, directory links, and cycles.                                                                                                                             |
| P1       | Hidden files were skipped in the tree but could be explicitly read, including credentials.                          | Shared sensitive-path checks on direct and resolved targets; supported-text restriction; tests for `.env`, vault keys, credentials, private keys, aliases. `.env.example` remains readable.                                                                             |
| P1       | Model-authored regexes ran synchronously in the server's grep tool.                                                 | Case-insensitive literal search, bounded pattern length; regression for regex metacharacters. Intentional compatibility change.                                                                                                                                         |
| P1       | Every question was sent to search services, including private questions and local-model sessions.                   | Composer opt-out, persisted `researchEnabled` preference, global `WEB_RESEARCH_ENABLED=false` for API/CLI, rerun preservation. Mock tests prove zero fetch calls with research off.                                                                                     |
| P1       | Markdown accepted arbitrary URL schemes and automatically loaded externally supplied images.                        | Allowed URL schemes, no credential-bearing/relative URLs, remote images loaded only after a click, no image referrer. Rendering tests cover script/data/file URLs and deferred images.                                                                                  |
| P1       | Docker sent the entire checkout to its builder and published the unauthenticated service on all interfaces.         | `.dockerignore` excludes secrets/data/local dependencies/build output; Compose publishes `127.0.0.1:4311`. Git ignore rules now cover other `.env.*` files and generated vault keys. Container build itself was not run.                                                |
| P2       | Browser-origin requests lacked explicit protection.                                                                 | Fetch Metadata and Origin fallback checks, no-store API responses, no-referrer/nosniff headers; same-origin and cross-origin tests. This is not authentication or DNS-rebinding protection.                                                                             |
| P2       | Zod failures, malformed JSON, unsupported content types, and body limits could become internal errors.              | Validation returns structured 400; Fastify 400/413/415 statuses preserved; unexpected internal messages hidden from API responses.                                                                                                                                      |
| P2       | Disabled models/providers were still loaded for execution.                                                          | Enabled-state filters in the model loader; tests toggle both layers. In-flight requests are not retroactively revoked.                                                                                                                                                  |
| P2       | An all-failed council could complete successfully; cancellation of the final call could be lost.                    | Require at least one successful member response, check final cancellation, persist completion before broadcasting it. Lifecycle regressions cover all-failed and final-call cancellation.                                                                               |
| P2       | Already-aborted requests could dispatch; retry listeners accumulated; Retry-After was ignored.                      | Abort guard before HTTP and semaphore dispatch, listener cleanup, seconds/date Retry-After support. Delays over 60 seconds fail the turn instead of retrying too early.                                                                                                 |
| P2       | Manual SSE reconnects reused the initial cursor and could add usage twice.                                          | Advance and deduplicate durable event IDs across connections; cursor regression tests.                                                                                                                                                                                  |
| P2       | Clone/rerun saved the old snapshot while executing current configuration; deleted councils spawned doomed sessions. | Both aliases snapshot current configuration, preserve research/workspace options, and return 409 before writing if the council is missing.                                                                                                                              |
| P2       | Activity said “last 30 days” while totals, groups, and logs were lifetime data.                                     | All sections use the same UTC calendar window; selectable 7/30/90/365 days; boundary and future-record tests.                                                                                                                                                           |
| P2       | No usage CSV; missing pricing could look like zero cost.                                                            | Batch-streamed CSV, null costs blank, formula-leading text neutralized, unpriced-call warning; estimates require both model prices.                                                                                                                                     |
| P2       | README, architecture, API reference, and doctor disagreed with implementation.                                      | Document persisted `.secret_key`, actual strategies/routes, current rerun semantics, plaintext transcripts, and outbound services; doctor uses the resolved durable-key state. A blank optional key in `.env.example` now correctly selects the persisted-key fallback. |

The browser test ran a private mock session through completion, checked its
transcript and usage, changed the reporting window, and received a CSV download.
The browser reported no warnings/errors during that flow. API tests separately
verify CSV content, filtering, quoting, and privacy behavior.

## Follow-up implementation (2026-08-29)

The next patch upgraded Fastify 5.12/@fastify-static 8 and Next.js 16.3/React 19; added allowed-host enforcement and optional operator authentication; bounded queues, extensions, directives, provider attempts and USD reservations; and added anonymous structured peer rankings with raw ballot visibility. Vitest is pinned to 3.2.7 because 4.x broke this repository’s TSX/workspace setup. The USD guard is conservative local estimation and cannot guarantee provider billing. During the first container build, npm's automatic audit summary reported one high-severity advisory, including after pruning; its identity was not retrieved because the dependency-metadata audit was not authorized. Automatic audit uploads are now disabled in reproducible container builds; a release still requires an authorized advisory review. The sections below retain the original audit record; completed items should be read in light of this follow-up.

## Remaining work, in recommended order

### 1. Supported dependencies and release hygiene — P1

Fastify 4's official LTS ended on June 30, 2025, and Next.js 14 is listed as
unsupported. Upgrade Fastify with its matching static plugin, then Next/React
with static-export, archive-install, and browser regression checks. The static
production UI reduces exposure to Next server-only vulnerabilities, but does
not make unsupported dependencies a sound maintenance strategy.
[Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/),
[Next.js support policy](https://nextjs.org/support-policy).

**Audit limitation:** `npm audit` could not run. Registry access was restricted,
and the escalated request was rejected because it would disclose dependency
metadata. No advisory count or clean vulnerability status is claimed. The
lockfile was not upgraded speculatively. Re-run a dependency advisory scan in an
authorized environment before publishing a release.

### 2. Authentication, host validation, and spending limits — P1

The API still assumes one trusted operator. Anyone with direct access can read
history, change providers, attach readable directories, and spend provider
credit. Browser-origin checks do not protect against native clients or DNS
rebinding. Add explicit allowed-host validation, optional single-operator auth
that also covers SSE/downloads, then roles only if multi-user demand exists.

Bound session queue length, total additional rounds, directives, and tool-call
counts. Four active sessions and two calls per provider limit concurrency but
not eventual cost or queue memory. A budget must reserve estimated maximum
cost **before** parallel requests, account for retries/tool hops, and fail closed
for unknown prices. Stopping after reported spend exceeds a cap is not a hard
budget. Provider billing can still exceed local estimates; explain that limit.

### 3. Execution fidelity, cancellation, and accounting — P1/P2

`runner.ts` loads live councils/models, including after a queued wait. Descriptive
snapshots are not immutable execution plans. Snapshot the resolved configuration
at creation and decide how key rotation/deletion should affect queued work.

`callMember` aggregates usage only after all tool hops succeed; successful early
hops can be lost when a later hop fails. Some adapters return null token counts
or empty text, and current aggregation can mistake missing counts for zero or
count empty content as a response. Persist per-attempt/per-hop usage with an
explicit unknown state; validate provider responses and surface refusals.

Research calls lack a session abort signal and their response-body reads are
not covered by a complete shared deadline. Provider queues are not abortable
while waiting (dispatch is guarded). CLI `session cancel` updates SQLite but
does not abort another process's active controller; use the HTTP cancellation
endpoint until cross-process control is implemented. Add graceful shutdown and
persist terminal events for restart recovery, not just session status.

Follow-up completed: `fitMessages` now reserves the system contract and final
task, clips rather than silently dropping them, and prefers recent supporting
context using a conservative UTF-8 byte estimate. Provider-native tokenizers
and deliberate summarization remain future quality improvements.

### 4. Workspace, prompt, and rendering isolation — P1/P2

The new checks block common mistakes and static symlink escapes, but not hard
links, adversarial filesystem races, secrets in normal source files, or all
credential filenames. A selected file exposes its parent folder, and selected
files are only priorities. Model tool arguments and result sizes are now
bounded. Add an explicit file allowlist and isolated read-only mounts for
untrusted repositories.

Follow-up completed: research, peer, evaluation, workspace, and tool text are
delimited as untrusted evidence in user-role context, with operator directives
separated and the task last. This reduces confusion but does not solve prompt injection.
OWASP recommends permission checks, tool parameter validation, and least
privilege as deterministic defenses around model behavior.
[OWASP prompt injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

Mermaid still loads executable code from jsDelivr using dynamic import. Bundle
a reviewed version locally, audit generated SVG handling, and introduce a
compatible Content Security Policy. Google Fonts were replaced with a local
system-font stack, so production builds no longer depend on that network fetch.

### 5. Better deliberation quality — P2

Follow-up completed: modes now use round-specific objectives, anonymous peer
ranking has a strict ballot and deterministic score, and the moderator contract
requires a recommendation, reasons, dissent, uncertainty, action plan, and only
supplied sources. Citation verification and calibrated quality scoring remain open.

Karpathy's LLM Council provides an instructive comparison: independent answers,
anonymous peer review/ranking, then chairman synthesis. OpenCouncil already has
broader provider/configuration support; adding measurable peer evaluation is
more useful than adding more named prompt variations.
[LLM Council](https://github.com/karpathy/llm-council).

Build an offline evaluation set comparing individual models with council output,
including disagreeing experts, wrong consensus, prompt injection, unavailable
providers, and private workspace questions. Stream token deltas after these
lifecycle guarantees have tests; partial text must not be mistaken for a final
answer after cancellation or retries.

### 6. History, usability, and accessibility — P2

Session pagination uses timestamp-only cursors; rows sharing a timestamp can be
skipped. Use `(created_at, id)` keyset pagination. Search should include the
stored council name after deletion. Add history pagination controls and session
retention/deletion, with clear confirmation and export before removal.

The chamber reconstructs the member rail from current configuration rather than
its stored snapshot. Refreshing a completed session can show waiting members or
lose historical names/colors. Prefer snapshot members and persisted lifecycle
state. Persist message-level usage for reload parity.

`Modal.tsx` lacks dialog semantics, focus trapping/restoration, and labelled-title
association. Settings form labels and loading/error recovery need an accessibility
pass. Add keyboard tests, small-screen checks, chart date labels, empty-day bars,
and explicit live connection status. A browser smoke test is not WCAG certification.

### 7. Operations and packaging — P2/P3

Key-file startup currently uses check/read/write with fallback. Concurrent first
starts can race; unreadable or malformed files can be replaced. Use exclusive
creation, atomic rotation, and fail-closed recovery rather than silently replacing
an existing key. Keep a tested restore procedure for both database and key.

The container still runs as root; change to a non-root user with volume ownership
and migration tests. Add a container smoke test, authenticated proxy example,
healthcheck, graceful shutdown, and release artifact verification. Keep build
output deterministic and test the advertised minimum Node version. Avoid
Postgres/Helm/multi-user scope until the single-node operational contract is clear.

## Research translated into implementation

- Node's realpath API resolves symbolic links; lexical string-prefix checks alone
  cannot establish physical containment. That distinction informed the workspace
  fix. Race-safe isolation needs a stronger boundary.
  [Node filesystem API](https://nodejs.org/api/fs.html#fsrealpathsyncpath-options).
- Fastify documents client validation failures as HTTP 400; the custom error
  handler now preserves that contract and parser statuses.
  [Fastify validation](https://fastify.dev/docs/v4.29.x/Reference/Validation-and-Serialization/).
- Fetch Metadata plus an Origin fallback protects browser request boundaries;
  it must not be presented as user authentication.
  [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- Retry-After accepts delay seconds or an HTTP date; retries honor either format.
  [MDN Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After).
- CSV quoting alone does not prevent formula injection. Exports also neutralize
  formula-leading names. Spreadsheet re-save behavior differs, so no universal
  formula-safety guarantee is made.
  [OWASP CSV injection](https://owasp.org/www-community/attacks/CSV_Injection).

## Verification record

- Prompt/template follow-up: **139 tests across 22 files passed**, including a
  local TypeScript workspace tool round trip; typecheck, ESLint, Prettier,
  production build, package dry run, and browser template flow passed. The
  package contains 75 files with no iCloud duplicate filenames.
- Baseline: 85 tests / 15 files, typecheck, lint passed on Node v22.23.0.
- First audit suite: **122 tests across 18 files passed**; typecheck, ESLint,
  Prettier, and `git diff --check` passed.
- Production build passed; shared declarations, both server bundles, and the
  static UI were regenerated. A later follow-up removed the Google Fonts fetch.
- Package smoke: archive contains static UI and audit docs, excludes local
  database/key files, and its CLI passes version/help/doctor plus a private
  mock council through completion. This reused installed dependencies and
  **was not a clean consumer npm install**.
- Browser: isolated database and mock providers; private question → completion →
  activity → seven-day filter → CSV download; no captured browser warnings/errors.
- Not exercised: real paid providers, Docker runtime, full dependency advisory scan,
  Windows, adversarial filesystem races, concurrent multi-process serving, or a
  formal accessibility/security assessment.
