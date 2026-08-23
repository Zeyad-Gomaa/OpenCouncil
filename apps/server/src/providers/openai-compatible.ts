/** OpenAI-compatible chat completions adapter.
 * Covers OpenAI, Groq, Together, Fireworks, DeepSeek, Mistral, xAI, OpenRouter,
 * and local runtimes (Ollama /v1, LM Studio, vLLM). */
import type { ProviderProtocol } from '@opencouncil/shared'
import { httpJson } from '../lib/http.js'
import type { ChatCallOpts, ChatResult, ProviderAdapter } from './types.js'

interface OpenAIResponse {
  choices?: { message?: { content?: string | null } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export const openAICompatibleAdapter: ProviderAdapter = {
  protocol: 'openai_compatible' as ProviderProtocol,
  defaultBaseUrl: 'https://api.openai.com/v1',

  async chat(opts: ChatCallOpts): Promise<ChatResult> {
    const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`
    const data = await httpJson<OpenAIResponse>(url, {
      headers: opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {},
      body: {
        model: opts.modelId,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      },
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
    })

    return {
      text: data.choices?.[0]?.message?.content ?? '',
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
    }
  },
}
