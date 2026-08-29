import { describe, expect, it } from 'vitest'
import { estimateTokens, fitMessages } from '../engine/context-budgeter.js'

const msg = (role: 'system' | 'user' | 'assistant', content: string) => ({ role, content })
describe('context budgeter', () => {
  it('keeps the system contract and final task while preferring recent context', () => {
    const fitted = fitMessages(
      [
        msg('system', 'SYSTEM CONTRACT ' + 's'.repeat(300)),
        msg('user', 'old ' + 'x'.repeat(400)),
        msg('assistant', 'recent'),
        msg('user', 'FINAL TASK ' + 'q'.repeat(300)),
      ],
      { contextWindow: 100, responseTokens: 20, safetyMargin: 10 },
    )
    expect(fitted[0]!.role).toBe('system')
    expect(fitted[0]!.content).toContain('SYSTEM CONTRACT')
    expect(fitted.at(-1)!.content).toContain('FINAL TASK')
    expect(fitted.some((m) => m.content.startsWith('old'))).toBe(false)
    expect(fitted.reduce((sum, m) => sum + estimateTokens(m.content), 0)).toBeLessThanOrEqual(70)
  })

  it('counts UTF-8 bytes rather than underestimating non-ASCII text', () => {
    expect(estimateTokens('😀😀😀😀')).toBe(4)
  })
})
