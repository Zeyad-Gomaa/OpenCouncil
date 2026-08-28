import { describe, expect, it } from 'vitest'
import { ARCHITECT, CRITIQUE, DEBATE, RED_TEAM, REVIEW, ROUND_ROBIN, SWARM, getStrategy } from '../engine/strategies.js'

describe('strategies', () => {
  it('round_robin is parallel and hides peer transcript', () => {
    expect(ROUND_ROBIN.parallel).toBe(true)
    expect(ROUND_ROBIN.includeTranscript(1)).toBe(false)
    expect(ROUND_ROBIN.includeTranscript(3)).toBe(false)
  })

  it('debate is sequential and includes transcript from round 2 onward', () => {
    expect(DEBATE.parallel).toBe(false)
    expect(DEBATE.includeTranscript(1)).toBe(false)
    expect(DEBATE.includeTranscript(2)).toBe(true)
    expect(DEBATE.includeTranscript(3)).toBe(true)
  })

  it('getStrategy resolves by kind', () => {
    expect(getStrategy('debate')).toBe(DEBATE)
    expect(getStrategy('round_robin')).toBe(ROUND_ROBIN)
    expect(getStrategy('swarm')).toBe(SWARM)
    expect(getStrategy('critique')).toBe(CRITIQUE)
    expect(getStrategy('review')).toBe(REVIEW)
    expect(getStrategy('architect')).toBe(ARCHITECT)
    expect(getStrategy('red_team')).toBe(RED_TEAM)
  })

  it('swarm is parallel with shared transcript; critique reviews after round 1', () => {
    expect(SWARM.parallel).toBe(true)
    expect(SWARM.includeTranscript(1)).toBe(true)
    expect(CRITIQUE.parallel).toBe(true)
    expect(CRITIQUE.includeTranscript(1)).toBe(false)
    expect(CRITIQUE.includeTranscript(2)).toBe(true)
    expect(DEBATE.parallel).toBe(false)
    expect(ROUND_ROBIN.parallel).toBe(true)
  })

  it('coding modes: review is parallel, architect is sequential, red team always shares', () => {
    expect(REVIEW.parallel).toBe(true)
    expect(REVIEW.includeTranscript(1)).toBe(false)
    expect(REVIEW.includeTranscript(2)).toBe(true)
    expect(ARCHITECT.parallel).toBe(false)
    expect(ARCHITECT.includeTranscript(2)).toBe(true)
    expect(RED_TEAM.parallel).toBe(true)
    expect(RED_TEAM.includeTranscript(1)).toBe(true)
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

  it('extraGroundingFromTranscript keeps web research, workspace, and user directives', async () => {
    const { extraGroundingFromTranscript } = await import('../engine/runner.js')
    const transcript = [
      { speaker: 'Web Research', memberId: 'system_web', round: 0, content: 'Source A' },
      { speaker: 'Workspace', memberId: 'system_workspace', round: 0, content: 'src/app.ts' },
      { speaker: 'Visionary', memberId: 'm1', round: 1, content: 'Dream big.' },
      { speaker: 'User Directive', memberId: 'user', round: 1, content: 'Focus on latency.' },
    ]
    const grounding = extraGroundingFromTranscript(transcript)
    expect(grounding.map((e) => e.memberId)).toEqual(['system_web', 'system_workspace', 'user'])
  })

  it('formatSearchResults generates clean citations and summaries', async () => {
    const { formatSearchResults } = await import('../engine/web-search.js')
    const formatted = formatSearchResults([
      { title: 'OpenCouncil Docs', url: 'https://opencouncil.dev', snippet: 'A multi-agent AI deliberation platform.' },
    ])
    expect(formatted).toContain('=== LIVE WEB RESEARCH & SOURCES ===')
    expect(formatted).toContain('[Source 1]: "OpenCouncil Docs"')
    expect(formatted).toContain('URL: https://opencouncil.dev')
    expect(formatted).toContain('A multi-agent AI deliberation platform.')
  })
})
