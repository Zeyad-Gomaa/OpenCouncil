import type { StrategyKind } from './domain.js'

export interface CouncilTemplateDTO {
  key: string
  name: string
  description: string
  strategy: StrategyKind
  rounds: number
  moderator: 'recommended' | 'none'
  useCases: string[]
  suggestedSeats: string[]
}

/** Curated starting points. They configure deliberation; operators still choose their own members/models. */
export const COUNCIL_TEMPLATES: CouncilTemplateDTO[] = [
  {
    key: 'decision-board',
    name: 'Decision Board',
    description: 'A proposal, an adversarial challenge, and a final decision with explicit tradeoffs.',
    strategy: 'debate',
    rounds: 2,
    moderator: 'recommended',
    useCases: ['Product decisions', 'Policy choices', 'Prioritization'],
    suggestedSeats: ['Proposer', 'Skeptic', 'Decision chair'],
  },
  {
    key: 'independent-panel',
    name: 'Independent Panel',
    description: 'Independent answers without anchoring or peer influence; pair with peer ranking for comparison.',
    strategy: 'round_robin',
    rounds: 1,
    moderator: 'recommended',
    useCases: ['Forecasts', 'Estimates', 'Second opinions'],
    suggestedSeats: ['Domain expert', 'Alternative-method expert', 'Chair'],
  },
  {
    key: 'research-synthesis',
    name: 'Research Synthesis',
    description: 'Independent research takes followed by evidence criticism and a source-aware synthesis.',
    strategy: 'critique',
    rounds: 2,
    moderator: 'recommended',
    useCases: ['Market research', 'Literature review', 'Fact-sensitive questions'],
    suggestedSeats: ['Researcher', 'Evidence critic', 'Synthesis chair'],
  },
  {
    key: 'code-review',
    name: 'Code Review',
    description: 'Inspect local code for concrete defects, regressions, missing tests, and ship readiness.',
    strategy: 'review',
    rounds: 2,
    moderator: 'recommended',
    useCases: ['Patch review', 'Repository audit', 'Release gate'],
    suggestedSeats: ['Correctness reviewer', 'Test reviewer', 'Maintainer'],
  },
  {
    key: 'architecture-review',
    name: 'Architecture Review',
    description: 'Develop one implementable design, then pressure-test operations, migration, and rollback.',
    strategy: 'architect',
    rounds: 2,
    moderator: 'recommended',
    useCases: ['System design', 'API design', 'Migration planning'],
    suggestedSeats: ['Lead architect', 'Operations reviewer', 'Delivery owner'],
  },
  {
    key: 'security-red-team',
    name: 'Security Red Team',
    description: 'Find exploitable failure paths and prioritize mitigations by impact and likelihood.',
    strategy: 'red_team',
    rounds: 2,
    moderator: 'recommended',
    useCases: ['Threat modeling', 'Abuse cases', 'Pre-release security review'],
    suggestedSeats: ['Attacker', 'Defender', 'Risk owner'],
  },
]
