import { beforeAll, describe, expect, it } from 'vitest'
import { setVaultKeyForTests } from '../vault/crypto.js'
import { mockAdapter } from '../providers/mock.js'
import { getAdapter } from '../providers/registry.js'

beforeAll(() => setVaultKeyForTests('test'))

describe('mock adapter', () => {
  it('returns deterministic-ish text with token estimates', async () => {
    const res = await mockAdapter.chat({
      baseUrl: '',
      modelId: 'demo-oracle',
      messages: [
        { role: 'system', content: 'You are The Oracle — a visionary.' },
        { role: 'user', content: 'How should we structure the council?' },
      ],
      timeoutMs: 1000,
    })
    expect(res.text.length).toBeGreaterThan(20)
    expect(res.promptTokens).toBeGreaterThan(0)
    expect(res.completionTokens).toBeGreaterThan(0)
  })

  it('produces synthesis when system prompt asks for it', async () => {
    const res = await mockAdapter.chat({
      baseUrl: '',
      modelId: 'demo-moderator',
      messages: [
        { role: 'system', content: 'Synthesize the deliberation.' },
        { role: 'user', content: 'topic x' },
      ],
      timeoutMs: 1000,
    })
    expect(res.text).toMatch(/Synthesis/i)
  })

  it('respects abort signal', async () => {
    const ac = new AbortController()
    const p = mockAdapter.chat({
      baseUrl: '',
      modelId: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      timeoutMs: 5000,
      signal: ac.signal,
    })
    ac.abort()
    await expect(p).rejects.toThrow(/cancelled/)
  })
})

describe('registry', () => {
  it('resolves every protocol', () => {
    expect(getAdapter('openai_compatible').defaultBaseUrl).toContain('api.openai.com')
    expect(getAdapter('anthropic').protocol).toBe('anthropic')
    expect(getAdapter('google').protocol).toBe('google')
    expect(getAdapter('mock').protocol).toBe('mock')
  })
})
