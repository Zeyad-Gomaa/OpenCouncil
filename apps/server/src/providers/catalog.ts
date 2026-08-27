/** Live model catalogs + pricing overlays for supported providers. */

import type { ProviderProtocol } from '@opencouncil/shared'
import { httpJson } from '../lib/http.js'

export interface CatalogModel {
  modelId: string
  displayName: string
  contextWindow: number | null
  inputPerMTokUsd: number | null
  outputPerMTokUsd: number | null
}

export interface CatalogResult {
  supported: boolean
  source: string
  reason?: string
  models: CatalogModel[]
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const OVERLAY_TTL_MS = 30 * 60 * 1000
const CATALOG_TIMEOUT_MS = 12_000

const SKIP_MODEL =
  /embed|whisper|tts|dall-e|moderation|babbage|davinci-002|sora|transcribe|omni-moderation|text-embedding|image-preview/i

let overlayCache: { at: number; models: CatalogModel[] } | null = null

export function isLocalBaseUrl(baseUrl: string | null): boolean {
  if (!baseUrl) return false
  try {
    const host = new URL(baseUrl).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return /localhost|127\.0\.0\.1/.test(baseUrl)
  }
}

export function providerHint(name: string, baseUrl: string | null): string | null {
  const s = `${name} ${baseUrl ?? ''}`.toLowerCase()
  if (s.includes('openrouter')) return 'openrouter'
  if (s.includes('together')) return 'together'
  if (s.includes('groq')) return 'groq'
  if (s.includes('mistral')) return 'mistralai'
  if (s.includes('deepseek')) return 'deepseek'
  if (s.includes('x.ai') || /\bxai\b/.test(s) || s.includes('x-ai')) return 'x-ai'
  if (s.includes('anthropic')) return 'anthropic'
  if (s.includes('googleapis') || s.includes('gemini') || /\bgoogle\b/.test(s)) return 'google'
  if (s.includes('openai.com') || /\bopenai\b/.test(s)) return 'openai'
  if (s.includes('ollama')) return 'ollama'
  return null
}

export function perTokenUsdToPerMillion(raw: unknown): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Number((n * 1_000_000).toFixed(6))
}

export function asPerMillion(raw: unknown): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Number(n.toFixed(6))
}

export function isChatModel(modelId: string, displayName = ''): boolean {
  return !SKIP_MODEL.test(`${modelId} ${displayName}`)
}

export function parseOpenRouterModels(payload: unknown): CatalogModel[] {
  const rows = Array.isArray(payload) ? payload : ((payload as { data?: unknown[] })?.data ?? [])
  const out: CatalogModel[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as {
      id?: string
      name?: string
      context_length?: number
      pricing?: { prompt?: string | number; completion?: string | number }
    }
    if (!r.id) continue
    if (!isChatModel(r.id, r.name)) continue
    out.push({
      modelId: r.id,
      displayName: r.name || r.id,
      contextWindow: Number.isFinite(r.context_length) ? Number(r.context_length) : null,
      inputPerMTokUsd: perTokenUsdToPerMillion(r.pricing?.prompt),
      outputPerMTokUsd: perTokenUsdToPerMillion(r.pricing?.completion),
    })
  }
  return out
}

export function parseOpenAICompatibleModels(payload: unknown): CatalogModel[] {
  const rows = Array.isArray(payload) ? payload : ((payload as { data?: unknown[] })?.data ?? [])
  const out: CatalogModel[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as {
      id?: string
      name?: string
      display_name?: string
      context_window?: number
      context_length?: number
      max_model_len?: number
      pricing?: { input?: number; output?: number; prompt?: number; completion?: number }
    }
    if (!r.id) continue
    const display = r.display_name || r.name || r.id
    if (!isChatModel(r.id, display)) continue
    const ctx = r.context_window ?? r.context_length ?? r.max_model_len
    const input = r.pricing?.input ?? r.pricing?.prompt
    const output = r.pricing?.output ?? r.pricing?.completion
    out.push({
      modelId: r.id,
      displayName: display,
      contextWindow: Number.isFinite(ctx) ? Number(ctx) : null,
      inputPerMTokUsd: input == null ? null : asPerMillion(input),
      outputPerMTokUsd: output == null ? null : asPerMillion(output),
    })
  }
  return out
}

export function parseAnthropicModels(payload: unknown): CatalogModel[] {
  const rows = Array.isArray(payload) ? payload : ((payload as { data?: unknown[] })?.data ?? [])
  const out: CatalogModel[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as { id?: string; display_name?: string }
    if (!r.id) continue
    out.push({
      modelId: r.id,
      displayName: r.display_name || r.id,
      contextWindow: 200_000,
      inputPerMTokUsd: null,
      outputPerMTokUsd: null,
    })
  }
  return out
}

export function parseGoogleModels(payload: unknown): CatalogModel[] {
  const rows = Array.isArray(payload) ? payload : ((payload as { models?: unknown[] })?.models ?? [])
  const out: CatalogModel[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as {
      name?: string
      displayName?: string
      inputTokenLimit?: number
      supportedGenerationMethods?: string[]
    }
    const methods = r.supportedGenerationMethods ?? []
    if (methods.length > 0 && !methods.includes('generateContent')) continue
    const raw = r.name || ''
    const modelId = raw.replace(/^models\//, '')
    if (!modelId) continue
    if (!isChatModel(modelId, r.displayName)) continue
    out.push({
      modelId,
      displayName: r.displayName || modelId,
      contextWindow: Number.isFinite(r.inputTokenLimit) ? Number(r.inputTokenLimit) : null,
      inputPerMTokUsd: null,
      outputPerMTokUsd: null,
    })
  }
  return out
}

/** Static fallbacks used only when the live catalog has no price. */
const STATIC_PRICES: Array<{ test: RegExp; input: number; output: number }> = [
  { test: /gpt-4o-mini/i, input: 0.15, output: 0.6 },
  { test: /gpt-4o/i, input: 2.5, output: 10 },
  { test: /gpt-4\.1-nano/i, input: 0.1, output: 0.4 },
  { test: /gpt-4\.1-mini/i, input: 0.4, output: 1.6 },
  { test: /gpt-4\.1/i, input: 2, output: 8 },
  { test: /gpt-5-mini/i, input: 0.25, output: 2 },
  { test: /gpt-5-nano/i, input: 0.05, output: 0.4 },
  { test: /gpt-5/i, input: 1.25, output: 10 },
  { test: /o3-mini/i, input: 1.1, output: 4.4 },
  { test: /o4-mini/i, input: 1.1, output: 4.4 },
  { test: /\bo3\b/i, input: 2, output: 8 },
  { test: /claude-haiku-4|claude-4-haiku/i, input: 0.8, output: 4 },
  { test: /claude-3-5-haiku|claude-haiku-3-5/i, input: 0.8, output: 4 },
  { test: /claude-3-haiku/i, input: 0.25, output: 1.25 },
  { test: /claude-sonnet-4/i, input: 3, output: 15 },
  { test: /claude-3-5-sonnet|claude-sonnet-3-5/i, input: 3, output: 15 },
  { test: /claude-opus-4/i, input: 15, output: 75 },
  { test: /claude-3-opus/i, input: 15, output: 75 },
  { test: /gemini-2\.5-pro/i, input: 1.25, output: 10 },
  { test: /gemini-2\.5-flash/i, input: 0.3, output: 2.5 },
  { test: /gemini-2\.0-flash/i, input: 0.1, output: 0.4 },
  { test: /gemini-1\.5-pro/i, input: 1.25, output: 5 },
  { test: /gemini-1\.5-flash/i, input: 0.075, output: 0.3 },
  { test: /deepseek-chat/i, input: 0.27, output: 1.1 },
  { test: /grok-3-mini/i, input: 0.3, output: 0.5 },
  { test: /grok-3/i, input: 3, output: 15 },
]

export function staticPriceFor(modelId: string): { input: number; output: number } | null {
  for (const row of STATIC_PRICES) {
    if (row.test.test(modelId)) return { input: row.input, output: row.output }
  }
  return null
}

export function matchOverlayModel(overlay: CatalogModel[], modelId: string, hint: string | null): CatalogModel | null {
  const exact = overlay.find((m) => m.modelId === modelId)
  if (exact) return exact
  if (hint) {
    const prefixed = overlay.find((m) => m.modelId === `${hint}/${modelId}`)
    if (prefixed) return prefixed
  }
  const suffix = overlay.filter((m) => m.modelId.endsWith(`/${modelId}`))
  if (suffix.length === 1) return suffix[0]!
  if (hint) {
    const variants = overlay.filter(
      (m) => m.modelId.startsWith(`${hint}/${modelId}-`) || m.modelId.startsWith(`${hint}/${modelId}:`),
    )
    if (variants.length > 0) {
      variants.sort((a, b) => a.modelId.length - b.modelId.length)
      return variants[0]!
    }
  }
  if (suffix.length > 1) {
    suffix.sort((a, b) => a.modelId.length - b.modelId.length)
    return suffix[0]!
  }
  return null
}

export function applyPricing(models: CatalogModel[], overlay: CatalogModel[], hint: string | null): CatalogModel[] {
  return models.map((m) => {
    if (m.inputPerMTokUsd != null && m.outputPerMTokUsd != null) return m
    const hit = matchOverlayModel(overlay, m.modelId, hint)
    const fallback = staticPriceFor(m.modelId)
    return {
      ...m,
      contextWindow: m.contextWindow ?? hit?.contextWindow ?? null,
      inputPerMTokUsd: m.inputPerMTokUsd ?? hit?.inputPerMTokUsd ?? fallback?.input ?? null,
      outputPerMTokUsd: m.outputPerMTokUsd ?? hit?.outputPerMTokUsd ?? fallback?.output ?? null,
    }
  })
}

async function fetchOpenRouterOverlay(apiKey?: string): Promise<CatalogModel[]> {
  if (overlayCache && Date.now() - overlayCache.at < OVERLAY_TTL_MS) return overlayCache.models
  try {
    const payload = await httpJson<unknown>(OPENROUTER_MODELS_URL, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      timeoutMs: CATALOG_TIMEOUT_MS,
    })
    const models = parseOpenRouterModels(payload)
    overlayCache = { at: Date.now(), models }
    return models
  } catch {
    return overlayCache?.models ?? []
  }
}

export function resetCatalogCache(): void {
  overlayCache = null
}

export async function fetchProviderCatalog(opts: {
  protocol: ProviderProtocol
  name: string
  baseUrl: string | null
  apiKey?: string | null
}): Promise<CatalogResult> {
  if (opts.protocol === 'mock') {
    return { supported: false, source: 'mock', reason: 'the mock adapter has no live catalog', models: [] }
  }

  const hint = providerHint(opts.name, opts.baseUrl)
  const adapterBase =
    opts.baseUrl?.replace(/\/$/, '') ||
    (opts.protocol === 'anthropic'
      ? 'https://api.anthropic.com'
      : opts.protocol === 'google'
        ? 'https://generativelanguage.googleapis.com'
        : 'https://api.openai.com/v1')

  const needsKey = !isLocalBaseUrl(adapterBase) && hint !== 'openrouter'
  if (needsKey && !opts.apiKey) {
    return {
      supported: true,
      source: hint || opts.protocol,
      reason: 'add an API key to list live models from this provider',
      models: [],
    }
  }

  let models: CatalogModel[] = []
  let source = hint || opts.protocol

  if (opts.protocol === 'anthropic') {
    const payload = await httpJson<unknown>(`${adapterBase}/v1/models`, {
      method: 'GET',
      headers: {
        'x-api-key': opts.apiKey ?? '',
        'anthropic-version': '2023-06-01',
        accept: 'application/json',
      },
      timeoutMs: CATALOG_TIMEOUT_MS,
    })
    models = parseAnthropicModels(payload)
    source = 'anthropic'
  } else if (opts.protocol === 'google') {
    const payload = await httpJson<unknown>(`${adapterBase}/v1beta/models?pageSize=200`, {
      method: 'GET',
      headers: { 'x-goog-api-key': opts.apiKey ?? '', accept: 'application/json' },
      timeoutMs: CATALOG_TIMEOUT_MS,
    })
    models = parseGoogleModels(payload)
    source = 'google'
  } else {
    const payload = await httpJson<unknown>(`${adapterBase}/models`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      timeoutMs: CATALOG_TIMEOUT_MS,
    })
    models = hint === 'openrouter' ? parseOpenRouterModels(payload) : parseOpenAICompatibleModels(payload)
    source = hint === 'openrouter' ? 'openrouter' : hint || 'openai_compatible'
  }

  const local = isLocalBaseUrl(adapterBase)
  const overlay =
    local || hint === 'openrouter'
      ? []
      : await fetchOpenRouterOverlay(hint === 'openrouter' ? (opts.apiKey ?? undefined) : undefined)
  const priced = applyPricing(models, overlay, hint)

  priced.sort((a, b) => a.displayName.localeCompare(b.displayName))
  return { supported: true, source, models: priced }
}
