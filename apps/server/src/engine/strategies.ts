/** Strategy interface + deliberation plans. */
import type { StrategyKind } from '@opencouncil/shared'

export interface DeliberationPlan {
  readonly kind: StrategyKind
  /** When true, members in a round run concurrently. */
  readonly parallel: boolean
  /**
   * Whether members see the transcript so far.
   * round_robin: never (independent takes).
   * debate / architect: from round 2 (sequential rebuttal).
   * swarm / red_team: always (shared memory, parallel).
   * critique / review: from round 2 (parallel review of prior takes).
   */
  includeTranscript(round: number): boolean
  /** Extra system-prompt guidance for this mode. */
  readonly promptAddon?: string
}

export const ROUND_ROBIN: DeliberationPlan = {
  kind: 'round_robin',
  parallel: true,
  includeTranscript: () => false,
}

export const DEBATE: DeliberationPlan = {
  kind: 'debate',
  parallel: false,
  includeTranscript: (round) => round > 1,
}

export const SWARM: DeliberationPlan = {
  kind: 'swarm',
  parallel: true,
  includeTranscript: () => true,
  promptAddon:
    'SWARM MODE: You are one agent in a parallel swarm. Do not wait for permission. Add a distinct angle, tool, or fact your peers are likely to miss. Be terse and high-signal. Cite sources.',
}

export const CRITIQUE: DeliberationPlan = {
  kind: 'critique',
  parallel: true,
  includeTranscript: (round) => round > 1,
  promptAddon:
    'CRITIQUE MODE: Round 1 is your independent take. Later rounds, pressure-test the swarm: name weak evidence, missing constraints, and what would falsify the leading view. Cite sources.',
}

export const REVIEW: DeliberationPlan = {
  kind: 'review',
  parallel: true,
  includeTranscript: (round) => round > 1,
  promptAddon:
    'CODE REVIEW MODE: You are reviewing a coding decision, design, or patch. Round 1: independent notes (bugs, missing tests, API shape, regressions). Later rounds: reconcile findings. Prefer concrete file/function-level comments, failure cases, and a clear ship / request-changes verdict. Cite docs and sources.',
}

export const ARCHITECT: DeliberationPlan = {
  kind: 'architect',
  parallel: false,
  includeTranscript: (round) => round > 1,
  promptAddon:
    'ARCHITECTURE MODE: Sequential design review for a coding decision. First speaker proposes a concrete design (components, data flow, interfaces, migration). Later speakers refine: coupling, operability, rollback, and simpler alternatives. End with a recommended shape, not a list of options. Cite sources.',
}

export const RED_TEAM: DeliberationPlan = {
  kind: 'red_team',
  parallel: true,
  includeTranscript: () => true,
  promptAddon:
    'RED TEAM MODE: Your job is to break the proposed coding approach. Hunt race conditions, auth gaps, data loss, unbounded cost, unsafe defaults, and hostile inputs. Be specific: attack, impact, likelihood, fix. Do not compliment the design unless you first name a real failure. Cite sources.',
}

export function getStrategy(kind: StrategyKind): DeliberationPlan {
  switch (kind) {
    case 'debate':
      return DEBATE
    case 'swarm':
      return SWARM
    case 'critique':
      return CRITIQUE
    case 'review':
      return REVIEW
    case 'architect':
      return ARCHITECT
    case 'red_team':
      return RED_TEAM
    default:
      return ROUND_ROBIN
  }
}
