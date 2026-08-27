import { describe, expect, it } from 'vitest'
import { DEBATE, ROUND_ROBIN, getStrategy } from '../engine/strategies.js'

describe('strategies', () => {
  it('round_robin builds N rounds over all members, no transcript', () => {
    const rounds = ROUND_ROBIN.buildRounds({ rounds: 2, memberIds: ['a', 'b', 'c'] })
    expect(rounds).toEqual([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ])
    expect(ROUND_ROBIN.includeTranscript(1)).toBe(false)
    expect(ROUND_ROBIN.includeTranscript(3)).toBe(false)
  })

  it('debate includes transcript from round 2 onward', () => {
    const rounds = DEBATE.buildRounds({ rounds: 3, memberIds: ['a', 'b'] })
    expect(rounds).toHaveLength(3)
    expect(DEBATE.includeTranscript(1)).toBe(false)
    expect(DEBATE.includeTranscript(2)).toBe(true)
    expect(DEBATE.includeTranscript(3)).toBe(true)
  })

  it('getStrategy resolves by kind', () => {
    expect(getStrategy('debate')).toBe(DEBATE)
    expect(getStrategy('round_robin')).toBe(ROUND_ROBIN)
  })

  it('formatTranscriptForMember distinguishes own previous messages from peers', async () => {
    const { formatTranscriptForMember } = await import('../engine/runner.js')
    const transcript = [
      { speaker: 'Visionary', memberId: 'm1', round: 1, content: 'We should dream big.' },
      { speaker: 'Pragmatist', memberId: 'm2', round: 1, content: 'We must ground it in reality.' },
    ]
    const formattedForPragmatist = formatTranscriptForMember(transcript, 'm2', 'Pragmatist')
    expect(formattedForPragmatist).toContain('[@Visionary in Round 1]:')
    expect(formattedForPragmatist).toContain('[YOU (@Pragmatist) in Round 1]:')
    expect(formattedForPragmatist).not.toContain('[@Pragmatist in Round 1]:')

    const formattedForVisionary = formatTranscriptForMember(transcript, 'm1', 'Visionary')
    expect(formattedForVisionary).toContain('[YOU (@Visionary) in Round 1]:')
    expect(formattedForVisionary).toContain('[@Pragmatist in Round 1]:')
  })
})
