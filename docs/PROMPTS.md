# Prompt and deliberation design

OpenCouncil uses one model-agnostic prompt contract rather than maintaining a
different complete prompt for every provider. The contract follows current
prompt-engineering guidance: give clear instructions, use consistent delimiters,
put durable rules in the system message, place untrusted context before the
task, and constrain machine-readable outputs with an exact format.

Reference: [Google Gemini prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies).

## Member turn

`engine/prompts.ts` builds two messages:

1. The system message defines the seat, instruction priority, quality bar,
   response shape, and optional read-only workspace tools.
2. The user message contains delimited untrusted council evidence, separate
   operator updates, and the final question plus the current strategy objective.

Peer responses, web results, workspace files, tool results, and peer rankings
are always evidence. Text inside them cannot change the member's role or grant
new tool access. Dynamic XML characters are escaped. Code claims should cite a
file and line; factual claims may cite only supplied URLs.

## Strategy objectives

The seven strategies vary information flow as well as wording:

| Strategy    | Flow                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| Round robin | Independent parallel answers                                           |
| Debate      | Sequential position, then rebuttal and update                          |
| Swarm       | Parallel, nonduplicative contributions                                 |
| Critique    | Independent answer, then evidence and logic audit                      |
| Review      | Inspect code, report concrete findings, then reconcile false positives |
| Architect   | Develop an implementable design, then improve and decide               |
| Red team    | Describe failure paths, then prioritize mitigations                    |

The curated council templates configure these strategies and recommend seat
roles. They remain editable starting points, not hidden prompt presets.

## Synthesis and peer ranking

Anonymous candidate IDs reduce identity anchoring during peer ranking. Ballots
must be valid JSON and list every candidate exactly once. The moderator receives
the transcript as untrusted evidence and must preserve material dissent,
distinguish agreement from correctness, state confidence and uncertainty, and
produce a verifiable action plan.

## Bounds and tests

The runner supplies an explicit response-token cap to every provider. Context
fitting preserves the system contract and final task. Workspace calls are
limited by tool hops, calls per hop, argument lengths, line ranges, file size,
and returned text size. Empty final responses and unfinished tool loops fail
the member turn instead of persisting protocol markup.

Tests cover trust separation and escaping, mandatory context retention,
structured synthesis, malformed tool arguments, result truncation, and an
end-to-end council that reads a temporary local TypeScript file and reports a
line-specific defect. These checks validate orchestration and safety properties;
they do not prove that every model will produce a better answer. Model quality
should also be measured with a versioned offline evaluation set and selected
real-provider trials before releases.
