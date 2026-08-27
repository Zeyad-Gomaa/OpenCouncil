import { describe, expect, it } from 'vitest'
import { estimateTokens, fitMessages } from '../engine/context-budgeter.js'

describe('context budgeter', () => {
  it('keeps system instructions and newest messages deterministically', () => {
    const messages = [
      { role: 'system' as const, content: 'rules' },
      { role: 'user' as const, content: 'old question' },
      { role: 'assistant' as const, content: 'old answer' },
      { role: 'user' as const, content: 'new question' },
    ]
    expect(fitMessages(messages, { contextWindow: 8, responseTokens: 1, safetyMargin: 1 })).toEqual([
      messages[0],
      messages[3],
    ])
    expect(estimateTokens('1234')).toBe(1)
  })
})
