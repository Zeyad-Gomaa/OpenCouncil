/** Provider adapter contract + shared chat types. */
import type { ProviderProtocol } from '@opencouncil/shared'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCallOpts {
  baseUrl: string
  apiKey?: string
  modelId: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  timeoutMs: number
  signal?: AbortSignal
}

export interface ChatResult {
  text: string
  promptTokens: number | null
  completionTokens: number | null
}

export interface ProviderAdapter {
  readonly protocol: ProviderProtocol
  /** Default base URL when the provider row has none. */
  readonly defaultBaseUrl: string | null
  chat(opts: ChatCallOpts): Promise<ChatResult>
}
