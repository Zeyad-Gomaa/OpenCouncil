/** Strategy interface + focused, round-aware deliberation objectives. */
import type { StrategyKind } from '@opencouncil/shared'

export interface DeliberationPlan {
  readonly kind: StrategyKind
  readonly parallel: boolean
  includeTranscript(round: number): boolean
  instruction(round: number): string
}

export const ROUND_ROBIN: DeliberationPlan = {
  kind: 'round_robin',
  parallel: true,
  includeTranscript: () => false,
  instruction: () =>
    'Develop an independent answer without guessing how other members responded. Give a recommendation, strongest evidence, key uncertainty, and a practical next step.',
}
export const DEBATE: DeliberationPlan = {
  kind: 'debate',
  parallel: false,
  includeTranscript: (round) => round > 1,
  instruction: (round) =>
    round === 1
      ? 'State a concrete position and the assumptions and evidence that support it.'
      : 'Address the strongest competing claim, concede valid points, resolve one material disagreement, and update your recommendation if warranted.',
}
export const SWARM: DeliberationPlan = {
  kind: 'swarm',
  parallel: true,
  includeTranscript: () => true,
  instruction: () =>
    'Add the highest-value fact, method, counterexample, or implementation detail that is still missing. Avoid duplicating peers; be terse and actionable.',
}
export const CRITIQUE: DeliberationPlan = {
  kind: 'critique',
  parallel: true,
  includeTranscript: (round) => round > 1,
  instruction: (round) =>
    round === 1
      ? 'Give an independent recommendation with explicit evidence and falsifiable assumptions.'
      : 'Audit the leading claims: identify weak evidence, missing constraints, contradictions, and what evidence would change the decision. End with a corrected recommendation.',
}
export const REVIEW: DeliberationPlan = {
  kind: 'review',
  parallel: true,
  includeTranscript: (round) => round > 1,
  instruction: (round) =>
    round === 1
      ? 'Inspect the relevant local code before making file-specific claims. Report only actionable findings, ordered by severity, with file:line, failure scenario, and a focused fix; include missing tests and a ship/request-changes verdict.'
      : 'Reconcile and deduplicate the review. Challenge false positives, verify disputed findings against code, and leave a prioritized release-blocking list plus the smallest adequate test plan.',
}
export const ARCHITECT: DeliberationPlan = {
  kind: 'architect',
  parallel: false,
  includeTranscript: (round) => round > 1,
  instruction: (round) =>
    round === 1
      ? 'Propose one implementable design: boundaries, data flow, interfaces, invariants, failure handling, migration, and verification.'
      : 'Improve the proposed design by testing coupling, capacity, security, operability, rollback, and simpler alternatives. Converge on one recommended shape and record rejected tradeoffs.',
}
export const RED_TEAM: DeliberationPlan = {
  kind: 'red_team',
  parallel: true,
  includeTranscript: () => true,
  instruction: () =>
    'Find concrete abuse or failure paths. For each, state preconditions, exploit or trigger, impact, likelihood, detection, and the smallest reliable mitigation. Prioritize auth bypass, data loss, races, unbounded cost, and hostile inputs.',
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
