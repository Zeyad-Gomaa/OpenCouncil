# OpenCouncil: open-source adoption and product readiness

**Research date:** 15 September 2026 · **Code reviewed:** `a36f04a` · **Version:** 0.4.0

## Recommendation

**Project constraint:** OpenCouncil is a free, open-source application. All proposed application features remain free and open source. There are no subscriptions, paid tiers, feature paywalls, or paid-support requirements in this plan.

Make **reviewing high-risk software changes** a flagship workflow within the self-hosted council application, initially for individual developers, open-source maintainers, and small engineering teams. A user supplies a proposed change and its constraints; OpenCouncil returns prioritized, evidence-linked findings, disputed risks, and a decision record that a human can accept or challenge. Keep general councils available; this is a recommended example of practical value, not an approved pivot that removes existing use cases.

The current application is a useful orchestration foundation. The most important work is to make outcomes verifiable, simplify setup, control what data leaves the user's machine, and make model use efficient. Shared-instance authorization is conditional on multi-user deployment, not a prerequisite for a useful local open-source release.

The flagship workflow is a **use-case hypothesis**, based on product fit and research into alternatives. No user interviews or real-provider quality benchmarks were conducted. Success means useful results, successful installation, repeat use, and maintainability. Passing the software tests does not establish adoption or review accuracy.

The implementation checklist is in [MARKET_READINESS_BACKLOG.md](MARKET_READINESS_BACKLOG.md). This report records recommendations; it does not implement the application changes.

## 1. The use case to pursue

### Initial users and recurring trigger

- **Users:** individual developers, open-source maintainers, technical founders, and small engineering teams.
- **Maintainer need:** evaluate a proposed change with accessible tools, retain control of source material, and receive findings that can be verified.
- **Trigger:** a database migration, authorization change, background-job rewrite, API compatibility change, or another change with meaningful failure consequences.
- **Job:** “Before we release this change, find the important failure paths, show the evidence, and give us a review record we can act on.”
- **Return trigger:** a revised patch, a disputed finding, or the next risky release.
- **Success:** the team verifies and resolves a useful finding, or completes a review faster with an explicit record of coverage and remaining uncertainty.

Start with TypeScript/JavaScript SaaS repositories and SQL migrations. This is a proposed scope limit for evaluation and support, not a claim that the engine cannot read other languages.

### Example complete workflow

1. Choose **Review a change**; select a repository and a base/head revision, or provide a patch and design note.
2. State the intended behavior, constraints, and questions. Preview the exact files and excerpts that may be sent to each provider. External research defaults off for private code.
3. Choose a review depth and see an estimated cost range and timeout. The application chooses a tested model configuration; advanced council settings remain available.
4. Independent reviewers examine the scoped change. A verification pass checks proposed findings against the captured code and challenges contradictions.
5. Receive **Blockers**, **Important risks**, **Unverified concerns**, **Coverage**, and **Suggested next steps**. Every actionable finding identifies the revision, file/line, trigger, impact, evidence, and a focused fix.
6. Mark each finding accepted, rejected, resolved, or needs investigation, with a reason. Export Markdown/JSON or create an explicitly requested GitHub review.
7. Rerun against a new revision and see which findings are resolved, persistent, or new. Record the human release decision separately from model output.

Suggested positioning: **“Review risky changes with multiple models. Get evidence, disagreements, and a clear next step.”**

The existing “research, debate, and agree” language emphasizes a mechanism and encourages agreement as the outcome. Replace it with the concrete review result. Do not promise error-free code, certified security, or consensus-proven truth.

### Why this use case

These are qualitative judgments about usefulness and maintenance effort, not measured adoption scores.

| Candidate market                  | Fit with current product                                   | Main obstacle                                                                   | Decision                                              |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| General multi-model chat          | Strong engine fit                                          | Needs clear examples and a simpler setup experience                             | Keep available alongside the flagship workflow        |
| High-risk change review           | Strong workspace, critique, architecture, and red-team fit | Needs diff ingestion, evidence validation, and demonstrated quality             | Primary hypothesis                                    |
| Architecture decision review      | Good prompt and synthesis fit                              | Less frequent; harder to objectively grade                                      | Adjacent workflow after initial validation            |
| Broad research assistant          | Research plumbing exists                                   | Snippets, weak provenance, and established research products                    | Defer as a headline product                           |
| Compliance/security certification | Some relevant prompts                                      | No assurance framework, validated coverage, or appropriate operational controls | Outside initial scope                                 |
| Enterprise agent platform         | Configurable orchestration                                 | Large identity, isolation, governance, and support scope                        | Defer until concrete community deployment needs exist |

## 2. What existing alternatives provide

Research used official product pages, repositories, documentation, and original papers. Feature availability is a dated snapshot. Vendor quality claims were not independently validated. Alternatives inform usability and feature choices; their prices do not determine this project's direction.

| Substitute             | Verified offering                                                                                                                                             | Consequence for OpenCouncil                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Karpathy’s LLM Council | Independent answers, anonymous ranking, and chairman synthesis in a local application. The author describes the project as unsupported inspiration.           | The council mechanism alone is readily reproducible. [Repository](https://github.com/karpathy/llm-council)                                                                                                                                                     |
| OpenRouter Fusion      | Parallel model analysis with research tools and a judge that produces a structured synthesis. The product description bills the underlying model completions. | Even a multi-model synthesis API is an existing substitute. Provider breadth and ranking are insufficient differentiation. [Fusion](https://openrouter.ai/openrouter/fusion), [documentation](https://openrouter.ai/docs/guides/routing/routers/fusion-router) |
| Cursor Bugbot          | Automated PR review integrated into the existing development workflow.                                                                                        | Make findings actionable in the user's workflow. [Product](https://cursor.com/bugbot)                                                                                                                                                                          |
| CodeRabbit             | PR and CLI review, pre-merge checks, and coding-agent workflows.                                                                                              | Use complete review workflows as a usability reference while retaining OpenCouncil's free, self-hosted approach. [Official FAQ](https://www.coderabbit.ai/faq)                                                                                                 |
| Continue               | The repository includes GitHub Actions for code review using Continue CLI.                                                                                    | A CLI and GitHub integration are useful distribution mechanisms, not unique advantages by themselves. [Official actions README](https://github.com/continuedev/continue/blob/main/actions/README.md)                                                           |
| Aider                  | An architect/editor workflow separates planning from code edits across two model calls.                                                                       | Named model roles and multiple calls already exist in developer tools. [Chat modes](https://aider.chat/docs/usage/modes.html)                                                                                                                                  |

**Reasons to use and contribute to OpenCouncil:** free and modifiable software, local orchestration, choice of local or remote models, explicit control of outbound source material, evidence captured against a revision, preserved dissent, and transparent resource use. Test whether these benefits make users' work easier. Uniqueness is not a prerequisite for a useful open-source project.

Fusion's model page contains an inconsistent generic FAQ calling it free, while its main description says underlying completions are charged. This report uses the explicit product description and does not use the generic FAQ for pricing calculations.

## 3. What is already implemented

Avoid spending the next iteration reimplementing completed work. Inspection confirmed:

- Fastify 5.12.1, Next.js 16.3.3, and React 19.2.8 declarations in the root package manifest.
- Optional operator authentication, allowed-host validation, protected API/SSE access, and login throttling.
- A queue limit of 32 waiting sessions, four active sessions, two concurrent calls per provider, bounded extensions/directives, and a 200-attempt session limit.
- Conservative USD reservations before provider attempts, including retries, and rejection of unpriced models when a budget applies.
- Structured anonymous peer-ranking ballots with validation, score aggregation, and coverage reporting.
- Read-only workspace tools with real-path checks and common credential-path filtering.
- Durable SSE events and reconnect cursor handling, encrypted provider credentials, SQLite migrations, exports, and activity accounting.
- A non-root Docker runtime and healthcheck; CI includes Node 22/24 and a package install smoke step.

Sources: [package manifest](../package.json), [authentication](../apps/server/src/auth.ts), [session manager](../apps/server/src/engine/session-manager.ts), [spending budget](../apps/server/src/engine/spending-budget.ts), [consensus](../apps/server/src/engine/consensus.ts), [Dockerfile](../Dockerfile), [CI](../.github/workflows/ci.yml).

The current [roadmap](ROADMAP.md), [architecture notes](ARCHITECTURE.md), and parts of the older [audit](AUDIT.md) retain superseded descriptions, including dependency upgrades, queue limits, rankings, and container ownership. Reconcile these documents before publishing a release. Next.js currently lists 16.x as Active LTS; the old unsupported-major warning does not describe this checkout. [Next.js support policy](https://nextjs.org/support-policy), [Fastify LTS policy](https://fastify.dev/docs/latest/Reference/LTS/).

## 4. Findings that most affect trust

**Observed** means reproduced locally with synthetic data or in the browser. **Source-confirmed** means established by code inspection without a complete failure simulation.

| Finding                                                                                                                                                                                                              | Evidence                                                                                                                                  | Required outcome                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Observed: failed synthesis can report success.** Three mock members succeeded, the moderator threw, and the session ended `completed` with zero synthesis messages.                                                | [runner.ts](../apps/server/src/engine/runner.ts), lines 502–514 and the `callMember` error path                                           | An expected final artifact must exist and pass validation before success; otherwise show partial/failed and offer a scoped retry. |
| **Observed: unknown usage becomes zero cost.** With configured prices, successful mock responses containing null token counts persisted as 0 input, 0 output, and $0.                                                | [runner.ts](../apps/server/src/engine/runner.ts), lines 705–706 and usage persistence                                                     | Keep unknown quantities unknown throughout the ledger, UI, and exports.                                                           |
| **Observed: successful earlier tool hops disappear from usage.** Each member returned a billed synthetic first hop, then failed. The ledger retained only zero-token error rows.                                     | [runner.ts](../apps/server/src/engine/runner.ts), lines 681–793 and 864 onward                                                            | Persist each attempt/hop immediately; a later failure must not erase earlier consumption.                                         |
| **Observed: context fitting can discard the original question after a tool call.** A constrained-window fixture retained system/tool text and dropped the original task.                                             | [context-budgeter.ts](../apps/server/src/engine/context-budgeter.ts), line 45; [runner.ts](../apps/server/src/engine/runner.ts), line 734 | Identify the operator task explicitly and preserve it, constraints, and instruction boundaries at every hop.                      |
| **Observed: selecting one file also permits reading a sibling.** Attaching synthetic `selected.ts` allowed `read_file` on `sibling.ts`. This is documented current behavior, not an escape from the configured root. | [workspace.ts](../apps/server/src/engine/workspace.ts), lines 90–104 and 373                                                              | Make selected-file scope an enforced allowlist and preview any expansion.                                                         |
| **Source-confirmed: execution can drift from its snapshot.** Councils and models are loaded from live tables during execution.                                                                                       | [runner.ts](../apps/server/src/engine/runner.ts), lines 189 and 621                                                                       | Capture a versioned execution plan and source revision; define revocation separately.                                             |
| **Source-confirmed: cancellation is incomplete.** Search calls lack the session signal; search timeout cleanup occurs before body consumption; CLI cancel only changes the database row.                             | [web-search.ts](../apps/server/src/engine/web-search.ts), lines 28–66; [cli.ts](../apps/server/src/cli.ts), line 332                      | Cancel network work, queues, and subprocess-owned runs; persist an honest terminal state.                                         |
| **Source-confirmed: key persistence can fail unsafely.** Existing key read failure can lead to replacement; creation is nonexclusive; failed writes allow an ephemeral key.                                          | [config.ts](../apps/server/src/config.ts), lines 65–80                                                                                    | Atomic creation/rotation and explicit recovery; never silently replace a vault key.                                               |
| **Observed: first-run sample is confusing.** Mock output included `<role>` and `<council_context>` fragments and canned agreement.                                                                                   | [mock.ts](../apps/server/src/providers/mock.ts), first-run browser session                                                                | A clearly labelled, coherent example that demonstrates the intended review artifact.                                              |
| **Observed: reload loses message usage details.** Total usage remained, while per-message token and latency labels disappeared.                                                                                      | [chamber](../apps/web/app/sessions/view/page.tsx), line 73; [session routes](../apps/server/src/routes/sessions.ts), line 152             | Persist message-to-attempt relationships and render the same record live and after reload.                                        |

Additional material gaps include snippet-only research, no validated finding schema, fixed candidate ordering/self-review, missing automated quality evaluation, timestamp-only history pagination, inaccessible modal behavior, externally loaded Mermaid code, and no team identity/authorization model. Each is addressed in the backlog.

## 5. Prove when multiple models help

More discussion is not a quality guarantee. A NeurIPS 2025 paper found that majority voting accounted for much of the gain attributed to debate across seven NLP benchmarks. It supports comparing simpler baselines, not concluding that every council is ineffective. [Debate or Vote](https://arxiv.org/abs/2508.17536).

A 2026 study found unfavorable cost/accuracy tradeoffs for unguided debate among homogeneous 7–8B models on two difficult benchmarks. Its scope does not establish how heterogeneous frontier models perform on code review. [The Cost of Consensus](https://arxiv.org/abs/2605.00914).

Anthropic reports substantial token overhead in its own multi-agent research system and emphasizes tasks whose value justifies that overhead. These results are evidence to measure economics carefully, not an estimate of OpenCouncil's token multiplier. [Engineering account](https://www.anthropic.com/engineering/multi-agent-research-system).

### Evaluation program

Build an initial 120-case set from consented repositories and curated fixtures: 40 changes with known defects, 20 clean changes, 20 architecture/compatibility cases, 20 malicious or misleading inputs, and 20 provider/lifecycle failures. Split into 60 development and 60 held-out cases, stratified by category. This is an initial screening set; expand it before broad accuracy claims.

Compare:

1. The strongest eligible single model using the same evidence and tools.
2. Repeated independent samples with a simple aggregation/verification baseline.
3. The current council configuration.
4. A proposed adaptive review configuration.

Run both equal-budget comparisons and comparisons at each mode's intended operating budget. Repeat stochastic cases, version prompts/models, randomize presentation, and use blinded human reviewers for actionable findings. Track inter-reviewer disagreement. Do not grade the product solely with the same models generating its output. [Agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

Measure actionable-finding precision, severity-weighted defect recall, unsupported claims, citation validity, retention of correct minority findings, reviewer time, cost per accepted finding, completion/cancellation reliability, and p50/p95 latency. Report sample sizes and confidence intervals.

**Proposed expansion gates, not current performance:** at least 85% actionable-finding precision and either a 15% relative recall improvement at comparable spend or a 25% cost reduction at comparable quality against the strongest simple baseline. If results are inconclusive, collect more data. If the council loses, simplify or narrow its use case.

## 6. Optimize the complete review

### Priority order

1. **Avoid unnecessary work.** Default to the diff, relevant definitions, tests, and declared constraints. Do not repeatedly send the entire transcript or first alphabetic files in a repository.
2. **Allocate review effort.** Use a quick pass for ordinary changes; use independent specialist reviews and targeted verification for risky or disputed issues. Do not run a fixed debate on every question.
3. **Reuse stable evidence.** Cache file content by revision/hash and search by normalized query, freshness, and policy scope. Respect provider caching support and preserve cache-specific usage.
4. **Stop on evidence-based criteria.** Stop when the required review checks have run, no unresolved high-impact dispute remains, or the cost/deadline requires a partial result. Agreement alone is insufficient.
5. **Measure bottlenecks.** Record queue time, retrieval time, each provider attempt, verification, synthesis, and UI rendering before increasing concurrency or replacing the database.
6. **Stream useful progress.** Show current stage, partial findings, coverage, and connectivity. Token streaming comes after reliable attempt IDs and replay semantics.

Current call count before tools/retries is approximately `members × rounds + peer-review calls + final synthesis`. Three members, two rounds, rankings, and a moderator mean **10 model calls**, before tool hops. That is a concrete reason to evaluate selective critique and fewer rounds.

Illustrative arithmetic only: at hypothetical rates of $1/million input tokens and $5/million output tokens, three reviewers each using 10,000 input/1,000 output tokens cost $0.045. A judge using 13,000 input/1,500 output costs $0.0205: **$0.0655 total**. A single 10,000-input/1,500-output call would cost $0.0175. Real prices, context growth, reasoning, retries, caching, tools, and search fees must come from the attempt ledger. These figures are not a price quote or measured workload.

### Operational targets to measure

| Area              | Initial acceptance target                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Activation        | At least 8/10 representative new users complete a real review without assistance within five minutes, excluding installing a local model               |
| Review time       | For a defined fixture of up to 500 changed lines and 20 relevant files, target p95 under three minutes in standard mode; record provider assumptions   |
| Cancellation      | No new dispatch after cancellation; UI updates promptly; local aborted work reaches terminal state within five seconds under controlled provider tests |
| Accounting        | Every dispatched attempt has a durable row; missing usage never displays as known zero                                                                 |
| Evidence          | Every actionable finding points to the reviewed revision and valid evidence; unsupported concerns are visibly separate                                 |
| Degraded behavior | Provider failure, missing evidence, budget stop, and synthesis failure cannot appear as an unqualified successful review                               |
| Accessibility     | Core flow works by keyboard; dialogs manage focus; controls have labels; small-screen layouts remain operable                                          |

Keep SQLite and the single-node deployment initially. Test representative long histories and concurrent reviews; move synchronous file scanning off the request/event loop if profiling shows stalls. Multi-instance scheduling and a new database are separate scale decisions.

## 7. Free distribution, community adoption, and maintenance

Keep OpenCouncil and its features MIT-licensed and free. Prioritize a reliable tagged release, clear setup instructions, a meaningful offline demo, local-model examples, and useful exports. Team features and integrations, if added, follow the same free/open-source policy.

OpenCouncil itself has no application fee. Users who select remote BYOK providers may incur charges from those providers; local models use the user's hardware. Keep usage accounting and budgets to protect users' resources, without adding application billing, subscriptions, or entitlements. Document a local-model path so a provider account is not the only way to use the app.

Improve the existing contribution process with a short architecture tour, reproducible development setup, focused issue templates, small starter issues, and clear expectations for tests and review. Publish support boundaries, supported versions, security reporting, and upgrade/restore instructions. Measure sustainability through reproducible bug reports, manageable maintenance work, and contributions that maintainers can review.

### First validation cycle

1. Interview 10–15 potential users about their current council/review workflow, setup barriers, missing capabilities, and preferred local or remote models. Ask for a concrete recent task.
2. Recruit five volunteer testers spanning individual developers, open-source maintainers, and small teams. Use synthetic or consented historical changes first.
3. Measure whether testers can install the app, complete a useful session, verify its output, and return for a second task. Record false positives and setup failures.
4. Target three of five testers using it weekly for four weeks and 8/10 new users completing setup and a first real session without assistance. These are proposed decision rules, not adoption benchmarks. Use voluntary feedback and local diagnostics; external telemetry is not required.
5. Publish a small, reproducible evaluation and a short demo of one complete workflow. Share tagged releases through GitHub and relevant open-source/self-hosting communities. Stars and downloads are secondary signals to successful use and useful contributions.
6. Let feedback shape priorities. If users prefer general research or independent answers, improve those workflows rather than forcing the review specialization. Limit feature expansion when maintenance costs outweigh demonstrated use.

No interviews, outreach, or publishing were performed during this review.

## 8. Delivery sequence

Estimates assume one experienced engineer, timely design decisions, and access to volunteer feedback. They are planning ranges, not commitments; community validation can run alongside implementation.

| Phase                      | Indicative timing       | Deliverable and gate                                                                                                                            |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Validate useful workflows  | Week 1                  | Volunteer feedback, a sample evidence-based review artifact, baseline/evaluation design, accurate docs                                          |
| Establish trust            | Weeks 1–3               | Correct outcome states, per-attempt ledger, task preservation, immutable plans, explicit workspace scope, cancellation and vault recovery fixes |
| Make the workflow usable   | Weeks 3–6               | Diff/revision ingestion, finding schema, verified references, onboarding, report UI, exports, revised demo; internal quality benchmark          |
| Test a community preview   | Weeks 6–8+              | Volunteer feedback and repeat usage; selective review optimization; reproducible release and restore checks                                     |
| Improve community adoption | Alongside releases      | Contributor documentation, starter issues, local-model recipes, reproducible bug reporting, and a clear release/support policy                  |
| Add requested integrations | When use justifies them | Free GitHub/CLI/MCP workflows; shared-instance controls only when that deployment is supported                                                  |

Do not put SSO, Kubernetes, Postgres, a plugin marketplace, desktop packaging, or many more providers on the first critical path. They become priorities only when deployment or community evidence requires them.

## 9. Verification performed for this report

- Existing test suite: **146 tests across 23 files passed** on Node **22.23.0**.
- Strict TypeScript checks and ESLint passed.
- Five isolated source probes reproduced: missing synthesis accepted as completed; null usage recorded as zero; original task discarded after a tool hop; sibling access from a single-file attachment; successful earlier hops lost from the usage ledger.
- Browser: isolated temporary database, built-in mock provider, research disabled; submitted a session, observed completion, reloaded, inspected settings and the provider modal. No captured warning/error console entries in that flow. Settings also rendered usefully at 390 × 844; this was a small-screen smoke check, not a complete accessibility audit.
- `npm audit` reported **two moderate development-package entries for one advisory**, affecting `vitest` and `@vitest/mocker`; no production entries appeared. The advisory requires specific development-server conditions, which were not demonstrated in OpenCouncil. Migrate to a patched compatible Vitest release and recheck the workspace/TSX configuration. [Advisory and scope](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- Package dry run before adding these reports: **76 files**, approximately **610 KB compressed / 2.10 MB unpacked**; included the static UI and no paths matching the checked database, `.secret_key`, or `.env` patterns. This was not a clean consumer install or a complete secret scan.
- No real provider credentials or user database contents were used. Source probes used in-memory databases and synthetic files. The browser used the committed production bundle; the additional probes ran bundled current source.
- Not performed: real-provider compatibility/quality/cost benchmarks, production load tests, fresh production build, fresh container build, restore drill, penetration test, or user interviews.

The old audit's historical fixes and test counts remain useful history. This report supersedes its current-priority assessment where direct inspection found newer implementation.
