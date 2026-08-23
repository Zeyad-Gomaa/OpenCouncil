/** Domain types shared between server and web. */

export type ProviderProtocol = 'openai_compatible' | 'anthropic' | 'google' | 'mock'

export interface ProviderDTO {
  id: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string | null
  defaultModelId: string | null
  enabled: boolean
  hasApiKey: boolean
  createdAt: string
}

export interface ModelDTO {
  id: string
  providerId: string
  modelId: string
  displayName: string
  contextWindow: number | null
  inputPerMTokUsd: number | null
  outputPerMTokUsd: number | null
  enabled: boolean
}

export type MessageKind = 'user' | 'discussion' | 'synthesis' | 'system'
export type SessionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface MemberDTO {
  id: string
  name: string
  modelId: string
  systemPrompt: string | null
  temperature: number
  maxTokens: number | null
  avatarColor: string
  enabled: boolean
  modelName?: string | null
  providerName?: string | null
}

export type StrategyKind = 'round_robin' | 'debate'

export interface CouncilDTO {
  id: string
  name: string
  description: string | null
  strategy: StrategyKind
  rounds: number
  moderatorMemberId: string | null
  members: MemberDTO[]
  createdAt: string
}

export interface MessageDTO {
  id: string
  sessionId: string
  memberId: string | null
  memberName: string
  role: 'user' | 'assistant'
  kind: MessageKind
  round: number
  content: string
  usage?: {
    promptTokens: number | null
    completionTokens: number | null
    totalTokens: number | null
    costUsd: number | null
    latencyMs: number | null
  }
  createdAt: string
}

export interface UsageEventDTO {
  id: number
  sessionId: string
  memberName: string | null
  providerName: string | null
  modelName: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number | null
  latencyMs: number | null
  status: 'ok' | 'error'
  createdAt: string
}

export type MemberLiveStatus = 'idle' | 'thinking' | 'done' | 'error'

export interface SessionDTO {
  id: string
  councilId: string
  councilName?: string
  topic: string
  status: SessionStatus
  error: string | null
  startedAt: string | null
  completedAt: string | null
  messageCount?: number
  moderatorMemberId?: string | null
  createdAt: string
}

export interface ActivityTotals {
  sessions: number
  messages: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number | null
  errors: number
}

export interface DailyActivity {
  day: string
  tokens: number
  costUsd: number | null
}

export interface GroupedUsage {
  name: string
  tokens: number
  messages: number
  costUsd: number | null
}

export interface ActivityStats {
  totals: ActivityTotals
  daily: DailyActivity[]
  byMember: GroupedUsage[]
  byModel: GroupedUsage[]
  byProvider: GroupedUsage[]
}
