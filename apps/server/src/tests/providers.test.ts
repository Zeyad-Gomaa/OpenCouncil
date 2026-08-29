import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setVaultKeyForTests } from '../vault/crypto.js'
import { mockAdapter } from '../providers/mock.js'
import { getAdapter } from '../providers/registry.js'
import { openAICompatibleAdapter } from '../providers/openai-compatible.js'

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

describe('provider response diagnostics', () => {
  afterEach(() => vi.restoreAllMocks())

  it('preserves finish reason and reasoning usage when visible text is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'gen-test',
          choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'internal' } }],
          usage: { prompt_tokens: 10, completion_tokens: 1024, completion_tokens_details: { reasoning_tokens: 900 } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const result = await openAICompatibleAdapter.chat({
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'deepseek/deepseek-v4-flash-0731',
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 1000,
    })
    expect(result.text).toBe('')
    expect(result.finishReason).toBe('length')
    expect(result.reasoningTokens).toBe(900)
    expect(result.responseId).toBe('gen-test')
  })

  it('joins text parts from multimodal OpenAI-compatible content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: [
                  { type: 'text', text: 'A' },
                  { type: 'text', text: 'B' },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const result = await openAICompatibleAdapter.chat({
      baseUrl: 'https://example.test/v1',
      modelId: 'model',
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 1000,
    })
    expect(result.text).toBe('AB')
    expect(result.finishReason).toBe('stop')
  })
})
