/** Adapter registry: protocol → adapter instance. */
import type { ProviderProtocol } from '@opencouncil/shared'
import { anthropicAdapter } from './anthropic.js'
import { googleAdapter } from './google.js'
import { mockAdapter } from './mock.js'
import { openAICompatibleAdapter } from './openai-compatible.js'
import type { ProviderAdapter } from './types.js'

const ADAPTERS: Record<ProviderProtocol, ProviderAdapter> = {
  openai_compatible: openAICompatibleAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  mock: mockAdapter,
}

export function getAdapter(protocol: ProviderProtocol): ProviderAdapter {
  return ADAPTERS[protocol]
}
