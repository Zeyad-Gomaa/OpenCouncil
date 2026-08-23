/** Fastify app factory: plugins, db, engine wiring, routes. */
import { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { DB } from './db/connection.js';
import type { SessionBus } from './engine/bus.js';
import type { SessionManager } from './engine/session-manager.js';
export interface AppDeps {
    config: AppConfig;
    db: DB;
    bus: SessionBus;
    sessions: SessionManager;
}
/** Engine DB callbacks used by the runner (kept here to avoid circular imports). */
export declare function makeRunnerDbHelpers(db: DB): {
    recordUsage(u: {
        sessionId: string;
        memberName: string;
        providerName: string;
        modelName: string;
        promptTokens: number;
        completionTokens: number;
        costUsd: number | null;
        latencyMs: number;
        status: "ok" | "error";
    }): void;
    insertMessage(m: {
        sessionId: string;
        memberId: string | null;
        memberName: string;
        kind: "discussion" | "synthesis" | "system" | "user";
        round: number;
        content: string;
    }): number;
    loadCouncil(councilId: string): {
        id: string;
        name: string;
        strategy: "round_robin" | "debate";
        rounds: number;
        moderatorMemberId: string | null;
        members: {
            id: string;
            name: string;
            modelId: string;
            systemPrompt: string | null;
            temperature: number;
            maxTokens: number | null;
            avatarColor: string;
            enabled: boolean;
        }[];
    } | null;
    loadModelForChat(modelId: string): {
        modelId: string;
        providerProtocol: "openai_compatible" | "anthropic" | "google" | "mock";
        providerBaseUrl: string | null;
        apiKeyEncrypted: string | null;
        inputPerMTokUsd: number | null;
        outputPerMTokUsd: number | null;
    } | null;
    updateSessionStatus(sessionId: string, status: "running" | "completed" | "failed" | "cancelled", error?: string): void;
};
export declare function buildApp(deps: AppDeps): Promise<FastifyInstance>;
