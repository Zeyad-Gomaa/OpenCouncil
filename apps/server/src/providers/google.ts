/** Google Gemini generateContent adapter. */
import type { ProviderProtocol } from '@opencouncil/shared'
import { httpJson } from '../lib/http.js'
import type { ChatCallOpts, ChatResult, ProviderAdapter } from './types.js'

interface GeminiResponse {
  responseId?: string
  candidates?: {
    finishReason?: string
    finishMessage?: string
    content?: { parts?: { text?: string }[] }
  }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
}

export const googleAdapter: ProviderAdapter = {
  protocol: 'google' as ProviderProtocol,
  defaultBaseUrl: 'https://generativelanguage.googleapis.com',

  async chat(opts: ChatCallOpts): Promise<ChatResult> {
    const base = opts.baseUrl.replace(/\/$/, '')
    const url = `${base}/v1beta/models/${encodeURIComponent(opts.modelId)}:generateContent`
    const system = opts.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const contents = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

    const data = await httpJson<GeminiResponse>(url, {
      headers: { 'x-goog-api-key': opts.apiKey ?? '' },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxTokens,
        },
      },
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
    })

    const candidate = data.candidates?.[0]
    return {
      text: (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
      promptTokens: data.usageMetadata?.promptTokenCount ?? null,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? null,
      finishReason: candidate?.finishReason ?? null,
      responseId: data.responseId ?? null,
      reasoningTokens: data.usageMetadata?.thoughtsTokenCount ?? null,
      refusalReason: candidate?.finishMessage ?? null,
    }
  },
}
