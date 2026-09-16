import type { ChatMessage } from '../providers/types.js'

/** Deterministic conservative approximation; provider tokenizers still differ. */
export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4)
}

export interface ContextBudget {
  contextWindow: number | null
  responseTokens: number
  safetyMargin: number
}

function clip(message: ChatMessage, tokens: number, keepEnd = false): ChatMessage {
  if (estimateTokens(message.content) <= tokens) return message
  const marker = '\n[…context truncated…]\n'
  let room = Math.max(1, tokens * 4 - Buffer.byteLength(marker, 'utf8'))
  const render = () => {
    const front = keepEnd ? Math.ceil(room / 2) : room
    const back = keepEnd ? Math.floor(room / 2) : 0
    return keepEnd
      ? message.content.slice(0, front) + marker + (back > 0 ? message.content.slice(-back) : '')
      : message.content.slice(0, room) + marker
  }
  let content = render()
  while (room > 1 && estimateTokens(content) > tokens) {
    room--
    content = render()
  }
  return {
    ...message,
    content,
  }
}

/**
 * Preserve the system contract and final task, then fill remaining space with
 * newest context. Mandatory messages are clipped rather than silently dropped.
 */
export function fitMessages(messages: ChatMessage[], budget: ContextBudget): ChatMessage[] {
  if (!budget.contextWindow || budget.contextWindow <= 0 || messages.length <= 1) return messages
  const available = Math.max(2, budget.contextWindow - budget.responseTokens - budget.safetyMargin)
  const systemIndexes = messages.map((m, i) => (m.role === 'system' ? i : -1)).filter((i) => i >= 0)
  const firstSystemIndex = systemIndexes[0]
  let lastTaskIndex = -1
  // The first user message is the operator's task. Later user messages may be
  // tool output or directives and must never displace the task under pressure.
  let taskIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role !== 'system') {
      lastTaskIndex = i
      break
    }
  }
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === 'user') {
      taskIndex = i
      break
    }
  }
  // With a single user message it is the final task; with multiple user
  // messages, later entries are normally tool results or directives.
  const userCount = messages.filter((m) => m.role === 'user').length
  const lastUserContent = lastTaskIndex >= 0 ? messages[lastTaskIndex]!.content : ''
  const hasToolResultTail = /^(?:TOOL RESULTS|WORKSPACE TOOL RESULTS):/i.test(lastUserContent.trim())
  const requiredTaskIndex = userCount > 1 && taskIndex >= 0 && hasToolResultTail ? taskIndex : lastTaskIndex
  const chosen = new Map<number, ChatMessage>()

  if (
    firstSystemIndex != null &&
    firstSystemIndex >= 0 &&
    requiredTaskIndex >= 0 &&
    firstSystemIndex !== requiredTaskIndex
  ) {
    const systemMessage = messages[firstSystemIndex]!
    const taskMessage = messages[requiredTaskIndex]!
    const mandatoryCost = estimateTokens(systemMessage.content) + estimateTokens(taskMessage.content)
    if (mandatoryCost <= available) {
      chosen.set(firstSystemIndex, systemMessage)
      chosen.set(lastTaskIndex, taskMessage)
    } else {
      const systemShare = Math.max(1, Math.floor(available * 0.55))
      chosen.set(firstSystemIndex, clip(systemMessage, systemShare))
      chosen.set(requiredTaskIndex, clip(taskMessage, available - systemShare, true))
    }
  } else {
    const mandatory =
      firstSystemIndex != null && firstSystemIndex >= 0 ? firstSystemIndex : Math.max(0, requiredTaskIndex)
    chosen.set(mandatory, clip(messages[mandatory]!, available, mandatory === requiredTaskIndex))
  }

  let used = [...chosen.values()].reduce((sum, message) => sum + estimateTokens(message.content), 0)
  for (let i = messages.length - 1; i >= 0; i--) {
    if (chosen.has(i)) continue
    const cost = estimateTokens(messages[i]!.content)
    if (used + cost <= available) {
      chosen.set(i, messages[i]!)
      used += cost
    }
  }
  return [...chosen.entries()].sort(([a], [b]) => a - b).map(([, message]) => message)
}
