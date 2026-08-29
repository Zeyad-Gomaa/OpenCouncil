/** OpenAI-compatible chat completions adapter.
 * Covers OpenAI, Groq, Together, Fireworks, DeepSeek, Mistral, xAI, OpenRouter,
 * and local runtimes (Ollama /v1, LM Studio, vLLM). */
import type { ProviderProtocol } from '@opencouncil/shared'
import { httpJson } from '../lib/http.js'
import type { ChatCallOpts, ChatResult, ProviderAdapter } from './types.js'

interface ContentPart {
  type?: string
  text?: string
}

interface OpenAIResponse {
  id?: string
  choices?: {
    finish_reason?: string | null
    message?: {
      content?: string | ContentPart[] | null
      refusal?: string | null
      reasoning?: string | null
    }
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    completion_tokens_details?: { reasoning_tokens?: number }
  }
}

function textContent(content: string | ContentPart[] | null | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part && (part.type === 'text' || part.type == null))
    .map((part) => part.text ?? '')
    .join('')
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

    const choice = data.choices?.[0]
    const message = choice?.message
    return {
      text: textContent(message?.content),
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
      finishReason: choice?.finish_reason ?? null,
      responseId: data.id ?? null,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      refusalReason: message?.refusal ?? null,
    }
  },
}
