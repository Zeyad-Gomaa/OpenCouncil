import type { ChatMessage } from '../providers/types.js'

/** Deterministic, local approximation: four characters count as one token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface ContextBudget {
  contextWindow: number | null
  responseTokens: number
  safetyMargin: number
}

/** Keep system instructions and the newest conversation content first. */
export function fitMessages(messages: ChatMessage[], budget: ContextBudget): ChatMessage[] {
  if (!budget.contextWindow || budget.contextWindow <= 0) return messages
  const available = Math.max(1, budget.contextWindow - budget.responseTokens - budget.safetyMargin)
  const systems: ChatMessage[] = []
  const recent: ChatMessage[] = []
  let used = 0
  for (const message of messages.filter((m) => m.role === 'system')) {
    const cost = estimateTokens(message.content)
    if (used + cost <= available) {
      systems.push(message)
      used += cost
    }
  }
  for (const message of [...messages.filter((m) => m.role !== 'system')].reverse()) {
    const cost = estimateTokens(message.content)
    if (used + cost <= available) {
      recent.unshift(message)
      used += cost
    }
  }
  return [...systems, ...recent]
}
