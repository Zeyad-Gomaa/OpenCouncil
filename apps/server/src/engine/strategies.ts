/** Strategy interface + round-robin and debate deliberation plans. */
import type { StrategyKind } from '@opencouncil/shared'

export interface DeliberationPlan {
  /** Human label used in logs. */
  readonly kind: StrategyKind
  /**
   * Return the sequence of rounds. Each round is a list of member ids that may
   * run in parallel within that round; rounds themselves are sequential.
   */
  buildRounds(ctx: { rounds: number; memberIds: string[] }): string[][]
  /**
   * What transcript context each member sees when answering in `round`.
   * round_robin: only the user topic (independent positions).
   * debate: full transcript so far (members see and rebut each other).
   */
  includeTranscript(round: number): boolean
}

export const ROUND_ROBIN: DeliberationPlan = {
  kind: 'round_robin',
  buildRounds: ({ rounds, memberIds }) => Array.from({ length: rounds }, () => memberIds),
  includeTranscript: () => false,
}

export const DEBATE: DeliberationPlan = {
  kind: 'debate',
  buildRounds: ({ rounds, memberIds }) => Array.from({ length: rounds }, () => memberIds),
  includeTranscript: (round) => round > 1,
}

export function getStrategy(kind: StrategyKind): DeliberationPlan {
  return kind === 'debate' ? DEBATE : ROUND_ROBIN
}
