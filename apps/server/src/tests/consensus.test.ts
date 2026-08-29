import { describe, expect, it } from 'vitest'
import { aggregateConsensus, peerReviewMessages } from '../engine/consensus.js'

const candidates = [
  { id: 'C1', memberId: 'm1', memberName: 'One', content: 'A' },
  { id: 'C2', memberId: 'm2', memberName: 'Two', content: 'B' },
]
describe('structured consensus', () => {
  it('aggregates complete valid rankings and exposes coverage without claiming truth', () => {
    const result = aggregateConsensus(
      candidates,
      [
        { memberId: 'm1', text: '{"ranking":["C2","C1"],"rationale":"B is specific"}' },
        { memberId: 'm2', text: '```json\n{"ranking":["C2","C1"],"rationale":"B handles risk"}\n```' },
      ],
      3,
    )
    expect(result.status).toBe('complete')
    expect(result.winnerId).toBe('C2')
    expect(result.topChoiceShare).toBe(1)
    expect(result.coverage).toBeCloseTo(2 / 3)
  })
  it('rejects malformed, partial and duplicate ballots', () => {
    const result = aggregateConsensus(
      candidates,
      [
        { memberId: 'm1', text: '{"ranking":["C1","C1"],"rationale":"bad"}' },
        { memberId: 'm2', text: 'not json' },
      ],
      2,
    )
    expect(result.status).toBe('insufficient_ballots')
    expect(result.rejected).toHaveLength(2)
    expect(result.winnerId).toBeNull()
  })
  it('does not expose author identities in evaluator prompts', () => {
    const serialized = JSON.stringify(peerReviewMessages('topic', candidates))
    expect(serialized).not.toContain('One')
    expect(serialized).not.toContain('m1')
  })
})
