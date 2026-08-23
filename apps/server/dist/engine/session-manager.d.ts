import type { SessionBus } from './bus.js';
import { type SessionRunner } from './runner.js';
export declare class SessionManager {
    private bus;
    private runner;
    private aborts;
    constructor(bus: SessionBus, runner: SessionRunner);
    /** Kicks off deliberation for a pre-created session row. */
    startSession(sessionId: string, councilId: string, topic: string): void;
    cancel(sessionId: string): boolean;
    isRunning(sessionId: string): boolean;
}
export declare function newSessionId(): string;
