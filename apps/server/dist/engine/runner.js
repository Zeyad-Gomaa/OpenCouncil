import { decryptSecret } from '../vault/crypto.js';
import { getAdapter } from '../providers/registry.js';
import { buildSynthesisMessages } from './moderator.js';
import { getStrategy } from './strategies.js';
const CALL_TIMEOUT_MS = 120_000;
function computeCost(promptTokens, completionTokens, inPrice, outPrice) {
    if (promptTokens == null || completionTokens == null)
        return null;
    if (inPrice == null && outPrice == null)
        return null;
    const inCost = ((promptTokens / 1_000_000) * (inPrice ?? 0)) || 0;
    const outCost = ((completionTokens / 1_000_000) * (outPrice ?? 0)) || 0;
    return Number((inCost + outCost).toFixed(6));
}
export class SessionRunner {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async run(sessionId, councilId, topic, signal) {
        const { bus } = this.deps;
        try {
            const council = this.deps.loadCouncil(councilId);
            if (!council)
                throw new Error('council not found');
            const activeMembers = council.members.filter((m) => m.enabled);
            if (activeMembers.length === 0)
                throw new Error('council has no enabled members');
            this.deps.updateSessionStatus(sessionId, 'running');
            // Record the user's topic as a message.
            const userMsgId = this.deps.insertMessage({
                sessionId,
                memberId: null,
                memberName: 'You',
                kind: 'user',
                round: 0,
                content: topic,
            });
            bus.publish({
                type: 'session.started',
                sessionId,
            });
            bus.publish({
                type: 'message.created',
                sessionId,
                message: {
                    id: String(userMsgId),
                    sessionId,
                    memberId: null,
                    memberName: 'You',
                    role: 'user',
                    kind: 'user',
                    round: 0,
                    content: topic,
                    createdAt: new Date().toISOString(),
                },
            });
            const strategy = getStrategy(council.strategy);
            const rounds = strategy.buildRounds({ rounds: council.rounds, memberIds: activeMembers.map((m) => m.id) });
            /** Transcript entries for debate/synthesis context. */
            const transcript = [];
            let roundNum = 0;
            for (const round of rounds) {
                roundNum++;
                if (signal.aborted)
                    throw new Error('cancelled');
                bus.publish({ type: 'round.started', sessionId, round: roundNum });
                await Promise.all(round.map(async (memberId) => {
                    const member = activeMembers.find((m) => m.id === memberId);
                    if (!member)
                        return;
                    await this.callMember(sessionId, member, topic, transcript, roundNum, strategy.includeTranscript(roundNum), signal);
                }));
                bus.publish({ type: 'round.completed', sessionId, round: roundNum });
            }
            // Moderator synthesis (optional).
            const moderator = council.moderatorMemberId
                ? activeMembers.find((m) => m.id === council.moderatorMemberId)
                : undefined;
            if (moderator) {
                if (signal.aborted)
                    throw new Error('cancelled');
                bus.publish({ type: 'moderator.started', sessionId });
                await this.callMember(sessionId, moderator, topic, transcript, roundNum + 1, true, signal, true);
            }
            bus.publish({ type: 'session.completed', sessionId });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (signal.aborted || msg === 'cancelled') {
                this.deps.updateSessionStatus(sessionId, 'cancelled');
                bus.publish({ type: 'session.cancelled', sessionId });
                throw new SessionCancelled();
            }
            this.deps.updateSessionStatus(sessionId, 'failed', msg);
            bus.publish({ type: 'session.failed', sessionId, error: msg });
            throw err;
        }
        this.deps.updateSessionStatus(sessionId, 'completed');
    }
    async callMember(sessionId, member, topic, transcript, round, includeTranscript, signal, isSynthesis = false) {
        const { bus } = this.deps;
        bus.publish({
            type: 'member.started',
            sessionId,
            round,
            memberName: member.name,
        });
        const model = this.deps.loadModelForChat(member.modelId);
        if (!model) {
            bus.publish({ type: 'member.completed', sessionId, round, memberName: member.name });
            return;
        }
        const messages = [];
        if (isSynthesis) {
            messages.push(...buildSynthesisMessages(topic, renderTranscript(transcript)));
        }
        else {
            if (member.systemPrompt)
                messages.push({ role: 'system', content: member.systemPrompt });
            if (includeTranscript && transcript.length > 0) {
                messages.push({
                    role: 'system',
                    content: `You are deliberating with other AI members of a council. Here is the transcript so far:\n\n` +
                        renderTranscript(transcript) +
                        `\n\nRespond to the others: rebut, concede, or refine. Be direct.`,
                });
            }
            messages.push({ role: 'user', content: topic });
        }
        const adapter = getAdapter(model.providerProtocol);
        const started = Date.now();
        try {
            const result = await adapter.chat({
                baseUrl: model.providerBaseUrl ?? adapter.defaultBaseUrl ?? '',
                apiKey: model.apiKeyEncrypted ? decryptSecret(model.apiKeyEncrypted) : undefined,
                modelId: model.modelId,
                messages,
                temperature: member.temperature,
                maxTokens: member.maxTokens ?? undefined,
                timeoutMs: CALL_TIMEOUT_MS,
                signal,
            });
            const latency = Date.now() - started;
            const cost = computeCost(result.promptTokens, result.completionTokens, model.inputPerMTokUsd, model.outputPerMTokUsd);
            const msgId = this.deps.insertMessage({
                sessionId,
                memberId: member.id,
                memberName: member.name,
                kind: isSynthesis ? 'synthesis' : 'discussion',
                round,
                content: result.text,
            });
            bus.publish({
                type: 'message.created',
                sessionId,
                message: {
                    id: String(msgId),
                    sessionId,
                    memberId: member.id,
                    memberName: member.name,
                    role: 'assistant',
                    kind: isSynthesis ? 'synthesis' : 'discussion',
                    round,
                    content: result.text,
                    usage: {
                        promptTokens: result.promptTokens,
                        completionTokens: result.completionTokens,
                        totalTokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
                        costUsd: cost,
                        latencyMs: latency,
                    },
                    createdAt: new Date().toISOString(),
                },
            });
            bus.publish({ type: 'member.completed', sessionId, round, memberName: member.name });
            this.deps.recordUsage({
                sessionId,
                memberName: member.name,
                providerName: '',
                modelName: model.modelId,
                promptTokens: result.promptTokens ?? 0,
                completionTokens: result.completionTokens ?? 0,
                costUsd: cost,
                latencyMs: latency,
                status: 'ok',
            });
            if (isSynthesis) {
                bus.publish({ type: 'synthesis.completed', sessionId, message: {
                        id: String(msgId),
                        sessionId,
                        memberId: member.id,
                        memberName: member.name,
                        role: 'assistant',
                        kind: 'synthesis',
                        round,
                        content: result.text,
                        usage: {
                            promptTokens: result.promptTokens,
                            completionTokens: result.completionTokens,
                            totalTokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
                            costUsd: cost,
                            latencyMs: latency,
                        },
                        createdAt: new Date().toISOString(),
                    } });
            }
            transcript.push({ speaker: member.name, content: result.text });
        }
        catch (err) {
            const latency = Date.now() - started;
            const msgText = err instanceof Error ? err.message : String(err);
            this.deps.recordUsage({
                sessionId,
                memberName: member.name,
                providerName: '',
                modelName: model.modelId,
                promptTokens: 0,
                completionTokens: 0,
                costUsd: null,
                latencyMs: latency,
                status: 'error',
            });
            // A failed member doesn't kill the council — log and move on.
            const failMsgId = this.deps.insertMessage({
                sessionId,
                memberId: member.id,
                memberName: member.name,
                kind: 'system',
                round,
                content: `[error] ${msgText}`,
            });
            bus.publish({
                type: 'message.created',
                sessionId,
                message: {
                    id: String(failMsgId),
                    sessionId,
                    memberId: member.id,
                    memberName: member.name,
                    role: 'assistant',
                    kind: 'system',
                    round,
                    content: `[error] ${msgText}`,
                    createdAt: new Date().toISOString(),
                },
            });
            bus.publish({ type: 'member.completed', sessionId, round, memberName: member.name });
        }
    }
}
export function renderTranscript(t) {
    return t.map((e) => `${e.speaker}: ${e.content}`).join('\n\n');
}
export class SessionCancelled extends Error {
}
//# sourceMappingURL=runner.js.map