import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyPricing,
  fetchProviderCatalog,
  isChatModel,
  matchOverlayModel,
  parseAnthropicModels,
  parseGoogleModels,
  parseOpenAICompatibleModels,
  parseOpenRouterModels,
  perTokenUsdToPerMillion,
  providerHint,
  resetCatalogCache,
  staticPriceFor,
} from '../providers/catalog.js'

const OR_GPT4O = {
  modelId: 'openai/gpt-4o',
  displayName: 'OpenAI: GPT-4o',
  contextWindow: 128000,
  inputPerMTokUsd: 2.5,
  outputPerMTokUsd: 10,
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetCatalogCache()
})

describe('catalog parsers', () => {
  it('converts OpenRouter per-token USD into $/MTok', () => {
    expect(perTokenUsdToPerMillion('0.0000025')).toBe(2.5)
    expect(perTokenUsdToPerMillion('0.00001')).toBe(10)
  })

  it('parses OpenRouter models and drops embeddings', () => {
    const models = parseOpenRouterModels({
      data: [
        {
          id: 'openai/gpt-4o',
          name: 'OpenAI: GPT-4o',
          context_length: 128000,
          pricing: { prompt: '0.0000025', completion: '0.00001' },
        },
        {
          id: 'openai/text-embedding-3-large',
          name: 'Embeddings',
          pricing: { prompt: '0.00000013', completion: '0' },
        },
      ],
    })
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject(OR_GPT4O)
  })

  it('parses OpenAI-compatible lists and Together-style pricing', () => {
    const models = parseOpenAICompatibleModels({
      data: [
        { id: 'gpt-4o-mini', object: 'model' },
        { id: 'whisper-1', object: 'model' },
        {
          id: 'meta-llama/Llama-3-8b',
          display_name: 'Llama 3 8B',
          context_length: 8192,
          pricing: { input: 0.18, output: 0.18 },
        },
      ],
    })
    expect(models.map((m) => m.modelId)).toEqual(['gpt-4o-mini', 'meta-llama/Llama-3-8b'])
    expect(models[1]?.inputPerMTokUsd).toBe(0.18)
  })

  it('parses Anthropic and Google catalogs', () => {
    const anthropic = parseAnthropicModels({
      data: [{ id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' }],
    })
    expect(anthropic[0]?.modelId).toBe('claude-sonnet-4-20250514')
    expect(anthropic[0]?.displayName).toBe('Claude Sonnet 4')

    const google = parseGoogleModels({
      models: [
        {
          name: 'models/gemini-2.0-flash',
          displayName: 'Gemini 2.0 Flash',
          inputTokenLimit: 1048576,
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/embedding-001',
          displayName: 'Embedding',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    })
    expect(google).toHaveLength(1)
    expect(google[0]?.modelId).toBe('gemini-2.0-flash')
    expect(google[0]?.contextWindow).toBe(1048576)
  })

  it('matches OpenRouter overlay ids onto native model ids', () => {
    expect(matchOverlayModel([OR_GPT4O], 'gpt-4o', 'openai')?.inputPerMTokUsd).toBe(2.5)
    expect(matchOverlayModel([OR_GPT4O], 'openai/gpt-4o', 'openrouter')?.displayName).toBe('OpenAI: GPT-4o')
    expect(matchOverlayModel([OR_GPT4O], 'claude-sonnet-4', 'anthropic')).toBeNull()
    const mini = {
      ...OR_GPT4O,
      modelId: 'openai/gpt-4o-mini',
      displayName: 'GPT-4o mini',
      inputPerMTokUsd: 0.15,
    }
    expect(matchOverlayModel([OR_GPT4O, mini], 'gpt-4o', 'openai')?.modelId).toBe('openai/gpt-4o')
    expect(matchOverlayModel([OR_GPT4O, mini], 'gpt-4o-mini', 'openai')?.modelId).toBe('openai/gpt-4o-mini')
  })

  it('fills missing prices from overlay then static tables', () => {
    const priced = applyPricing(
      [
        {
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          contextWindow: null,
          inputPerMTokUsd: null,
          outputPerMTokUsd: null,
        },
        {
          modelId: 'claude-sonnet-4-20250514',
          displayName: 'Sonnet 4',
          contextWindow: 200000,
          inputPerMTokUsd: null,
          outputPerMTokUsd: null,
        },
      ],
      [OR_GPT4O],
      'openai',
    )
    expect(priced[0]?.inputPerMTokUsd).toBe(2.5)
    expect(priced[0]?.contextWindow).toBe(128000)
    expect(priced[1]?.inputPerMTokUsd).toBe(3)
    expect(staticPriceFor('claude-sonnet-4-20250514')?.output).toBe(15)
  })

  it('detects provider hints', () => {
    expect(providerHint('OpenRouter', 'https://openrouter.ai/api/v1')).toBe('openrouter')
    expect(providerHint('xAI', 'https://api.x.ai/v1')).toBe('x-ai')
    expect(isChatModel('text-embedding-3-small')).toBe(false)
    expect(isChatModel('gpt-4o')).toBe(true)
  })
})

describe('fetchProviderCatalog', () => {
  it('lists OpenRouter availability with native prices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain('openrouter.ai')
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'anthropic/claude-sonnet-4',
                name: 'Anthropic: Claude Sonnet 4',
                context_length: 200000,
                pricing: { prompt: '0.000003', completion: '0.000015' },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }),
    )

    const catalog = await fetchProviderCatalog({
      protocol: 'openai_compatible',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-test',
    })
    expect(catalog.supported).toBe(true)
    expect(catalog.source).toBe('openrouter')
    expect(catalog.models[0]).toMatchObject({
      modelId: 'anthropic/claude-sonnet-4',
      inputPerMTokUsd: 3,
      outputPerMTokUsd: 15,
    })
  })

  it('lists OpenAI models and overlays OpenRouter prices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('api.openai.com')) {
          return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'whisper-1' }] }), { status: 200 })
        }
        if (url.includes('openrouter.ai')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'openai/gpt-4o',
                  name: 'OpenAI: GPT-4o',
                  context_length: 128000,
                  pricing: { prompt: '0.0000025', completion: '0.00001' },
                },
              ],
            }),
            { status: 200 },
          )
        }
        throw new Error(url)
      }),
    )

    const catalog = await fetchProviderCatalog({
      protocol: 'openai_compatible',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
    })
    expect(catalog.models.map((m) => m.modelId)).toEqual(['gpt-4o'])
    expect(catalog.models[0]?.inputPerMTokUsd).toBe(2.5)
    expect(catalog.models[0]?.contextWindow).toBe(128000)
  })

  it('asks for a key instead of calling a remote API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const catalog = await fetchProviderCatalog({
      protocol: 'anthropic',
      name: 'Anthropic',
      baseUrl: null,
      apiKey: null,
    })
    expect(catalog.models).toEqual([])
    expect(catalog.reason).toMatch(/API key/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not pretend the mock adapter has a catalog', async () => {
    const catalog = await fetchProviderCatalog({
      protocol: 'mock',
      name: 'Demo',
      baseUrl: null,
      apiKey: null,
    })
    expect(catalog.supported).toBe(false)
  })
})
