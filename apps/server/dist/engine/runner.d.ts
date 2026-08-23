/** The deliberation runner: executes a council session end-to-end. */
import type { MemberDTO, StrategyKind } from '@opencouncil/shared';
import type { SessionBus } from './bus.js';
export interface RunnerDeps {
    bus: SessionBus;
    recordUsage(u: {
        sessionId: string;
        memberName: string;
        providerName: string;
        modelName: string;
        promptTokens: number;
        completionTokens: number;
        costUsd: number | null;
        latencyMs: number;
        status: 'ok' | 'error';
    }): void;
    insertMessage(m: {
        sessionId: string;
        memberId: string | null;
        memberName: string;
        kind: 'user' | 'discussion' | 'synthesis' | 'system';
        round: number;
        content: string;
    }): number;
    loadCouncil(councilId: string): {
        id: string;
        name: string;
        strategy: StrategyKind;
        rounds: number;
        moderatorMemberId: string | null;
        members: MemberDTO[];
    } | null;
    loadModelForChat(modelId: string): {
        modelId: string;
        providerProtocol: 'openai_compatible' | 'anthropic' | 'google' | 'mock';
        providerBaseUrl: string | null;
        apiKeyEncrypted: string | null;
        inputPerMTokUsd: number | null;
        outputPerMTokUsd: number | null;
    } | null;
    updateSessionStatus(sessionId: string, status: 'running' | 'completed' | 'failed' | 'cancelled', error?: string): void;
}
export declare class SessionRunner {
    private deps;
    constructor(deps: RunnerDeps);
    run(sessionId: string, councilId: string, topic: string, signal: AbortSignal): Promise<void>;
    private callMember;
}
export declare function renderTranscript(t: {
    speaker: string;
    content: string;
}[]): string;
export declare class SessionCancelled extends Error {
}
