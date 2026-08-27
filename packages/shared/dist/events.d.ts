/** Typed council event stream (SSE payloads). */
import type { MessageDTO, UsageEventDTO } from './domain.js';
export type CouncilEvent = {
    type: 'session.started';
    sessionId: string;
} | {
    type: 'round.started';
    sessionId: string;
    round: number;
} | {
    type: 'member.started';
    sessionId: string;
    round: number;
    memberId: string;
    memberName: string;
} | {
    type: 'message.replay';
    sessionId: string;
    message: MessageDTO;
} | {
    type: 'message.created';
    sessionId: string;
    message: MessageDTO;
} | {
    type: 'member.completed';
    sessionId: string;
    round: number;
    memberId: string;
    memberName: string;
} | {
    type: 'member.failed';
    sessionId: string;
    round: number;
    memberId: string;
    memberName: string;
    error: string;
} | {
    type: 'round.completed';
    sessionId: string;
    round: number;
} | {
    type: 'moderator.started';
    sessionId: string;
} | {
    type: 'synthesis.completed';
    sessionId: string;
    message: MessageDTO;
} | {
    type: 'session.extended';
    sessionId: string;
    additionalRounds: number;
    totalRounds: number;
} | {
    type: 'session.concluding';
    sessionId: string;
    reason?: string;
} | {
    type: 'session.completed';
    sessionId: string;
} | {
    type: 'session.failed';
    sessionId: string;
    error: string;
} | {
    type: 'session.cancelled';
    sessionId: string;
} | {
    type: 'usage.recorded';
    sessionId: string;
    usage: UsageEventDTO;
};
export type CouncilEventType = CouncilEvent['type'];
