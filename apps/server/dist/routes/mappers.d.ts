/** Row → DTO mappers keeping API responses clean (no secrets, no internals). */
import type { DB } from '../db/connection.js';
import type { CouncilDTO, MemberDTO, MessageDTO, ModelDTO, ProviderDTO, SessionDTO } from '@opencouncil/shared';
interface ProviderRow {
    id: string;
    name: string;
    protocol: string;
    base_url: string | null;
    default_model_id: string | null;
    enabled: number;
    api_key_encrypted: string | null;
    created_at: string;
}
export declare function providerToDTO(r: ProviderRow): ProviderDTO;
interface ModelRow {
    id: string;
    provider_id: string;
    model_id: string;
    display_name: string;
    context_window: number | null;
    input_per_mtok_usd: number | null;
    output_per_mtok_usd: number | null;
    enabled: number;
}
export declare function modelToDTO(r: ModelRow): ModelDTO;
export interface MemberRowJoined extends Omit<MemberDTO, 'enabled' | 'temperature'> {
    temperature: number;
    enabled: number;
}
export declare function memberToDTO(r: {
    id: string;
    name: string;
    model_id: string | null;
    system_prompt: string | null;
    temperature: number;
    max_tokens: number | null;
    avatar_color: string;
    enabled: number;
    model_display_name?: string | null;
    provider_name?: string | null;
}): MemberDTO;
export declare function councilToDTO(r: {
    id: string;
    name: string;
    description: string | null;
    strategy: string;
    rounds: number;
    moderator_member_id: string | null;
    created_at: string;
}, members: MemberDTO[]): CouncilDTO;
export declare function messageToDTO(r: {
    id: number;
    session_id: string;
    member_id: string | null;
    member_name: string;
    role: 'user' | 'assistant';
    kind: MessageDTO['kind'];
    round: number;
    content: string;
    created_at: string;
}): MessageDTO;
export declare function sessionToDTO(r: {
    id: string;
    council_id: string;
    topic: string;
    status: SessionDTO['status'];
    error: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    council_name?: string;
    message_count?: number;
}): SessionDTO;
export declare function logActivity(db: DB, action: string, detail?: unknown): void;
export {};
