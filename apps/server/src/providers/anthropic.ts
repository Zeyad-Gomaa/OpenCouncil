/** Anthropic Messages API adapter. */
import type { ProviderProtocol } from '@opencouncil/shared'
import { httpJson } from '../lib/http.js'
import type { ChatCallOpts, ChatResult, ProviderAdapter } from './types.js'

interface AnthropicResponse {
  id?: string
  content?: { type: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  stop_reason?: string | null
}

export const anthropicAdapter: ProviderAdapter = {
  protocol: 'anthropic' as ProviderProtocol,
  defaultBaseUrl: 'https://api.anthropic.com',

  async chat(opts: ChatCallOpts): Promise<ChatResult> {
    const system = opts.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const rest = opts.messages.filter((m) => m.role !== 'system')

    const data = await httpJson<AnthropicResponse>(`${opts.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      headers: {
        'x-api-key': opts.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: opts.modelId,
        max_tokens: opts.maxTokens ?? 4096,
        ...(system ? { system } : {}),
        messages: rest.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        temperature: opts.temperature,
      },
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
    })

    return {
      text: (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join(''),
      promptTokens: data.usage?.input_tokens ?? null,
      completionTokens: data.usage?.output_tokens ?? null,
      finishReason: data.stop_reason ?? null,
      responseId: data.id ?? null,
    }
  },
}
