/** Row → DTO mappers keeping API responses clean (no secrets, no internals). */
import type { DB } from '../db/connection.js'
import type {
  CouncilDTO,
  MemberDTO,
  MessageDTO,
  ModelDTO,
  ProviderDTO,
  SessionDTO,
  StrategyKind,
  ProviderProtocol,
} from '@opencouncil/shared'

interface ProviderRow {
  id: string
  name: string
  protocol: string
  base_url: string | null
  default_model_id: string | null
  enabled: number
  api_key_encrypted: string | null
  created_at: string
}

export function providerToDTO(r: ProviderRow): ProviderDTO {
  return {
    id: r.id,
    name: r.name,
    protocol: r.protocol as ProviderProtocol,
    baseUrl: r.base_url,
    defaultModelId: r.default_model_id,
    enabled: !!r.enabled,
    hasApiKey: !!r.api_key_encrypted,
    createdAt: r.created_at,
  }
}

interface ModelRow {
  id: string
  provider_id: string
  model_id: string
  display_name: string
  context_window: number | null
  input_per_mtok_usd: number | null
  output_per_mtok_usd: number | null
  enabled: number
}

export function modelToDTO(r: ModelRow): ModelDTO {
  return {
    id: r.id,
    providerId: r.provider_id,
    modelId: r.model_id,
    displayName: r.display_name,
    contextWindow: r.context_window,
    inputPerMTokUsd: r.input_per_mtok_usd,
    outputPerMTokUsd: r.output_per_mtok_usd,
    enabled: !!r.enabled,
  }
}

export interface MemberRowJoined extends Omit<MemberDTO, 'enabled' | 'temperature'> {
  temperature: number
  enabled: number
}

export function memberToDTO(r: {
  id: string
  name: string
  model_id: string | null
  system_prompt: string | null
  temperature: number
  max_tokens: number | null
  avatar_color: string
  enabled: number
  model_display_name?: string | null
  provider_name?: string | null
}): MemberDTO {
  return {
    id: r.id,
    name: r.name,
    modelId: r.model_id ?? '',
    systemPrompt: r.system_prompt,
    temperature: r.temperature,
    maxTokens: r.max_tokens,
    avatarColor: r.avatar_color,
    enabled: !!r.enabled,
    modelName: r.model_display_name ?? null,
    providerName: r.provider_name ?? null,
  }
}

export function councilToDTO(
  r: {
    id: string
    name: string
    description: string | null
    strategy: string
    rounds: number
    moderator_member_id: string | null
    created_at: string
  },
  members: MemberDTO[],
): CouncilDTO {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    strategy: r.strategy as StrategyKind,
    rounds: r.rounds,
    moderatorMemberId: r.moderator_member_id,
    members,
    createdAt: r.created_at,
  }
}

export function messageToDTO(r: {
  id: number
  session_id: string
  member_id: string | null
  member_name: string
  role: 'user' | 'assistant'
  kind: MessageDTO['kind']
  round: number
  content: string
  created_at: string
}): MessageDTO {
  return {
    id: String(r.id),
    sessionId: r.session_id,
    memberId: r.member_id,
    memberName: r.member_name || 'Unknown',
    role: r.role,
    kind: r.kind,
    round: r.round,
    content: r.content,
    createdAt: r.created_at,
  }
}

export function sessionToDTO(
  r: {
    id: string
    council_id: string
    topic: string
    status: SessionDTO['status']
    error: string | null
    started_at: string | null
    completed_at: string | null
    created_at: string
    council_name?: string
    message_count?: number
  },
): SessionDTO {
  return {
    id: r.id,
    councilId: r.council_id,
    councilName: r.council_name,
    topic: r.topic,
    status: r.status,
    error: r.error,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    messageCount: r.message_count,
    createdAt: r.created_at,
  }
}

export function logActivity(db: DB, action: string, detail?: unknown): void {
  db.prepare('INSERT INTO activity_log (action, detail) VALUES (?, ?)')
    .run(action, detail ? JSON.stringify(detail) : null)
}
