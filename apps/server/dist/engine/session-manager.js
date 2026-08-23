/** Session lifecycle manager: create, run async, cancel, track aborts. */
import { randomUUID } from 'node:crypto';
import { SessionCancelled } from './runner.js';
export class SessionManager {
    bus;
    runner;
    aborts = new Map();
    constructor(bus, runner) {
        this.bus = bus;
        this.runner = runner;
    }
    /** Kicks off deliberation for a pre-created session row. */
    startSession(sessionId, councilId, topic) {
        const ac = new AbortController();
        this.aborts.set(sessionId, ac);
        const runner = this.runner;
        void (async () => {
            try {
                await runner.run(sessionId, councilId, topic, ac.signal);
                // terminal events (completed/failed/cancelled) already published by runner
            }
            catch (err) {
                if (!(err instanceof SessionCancelled)) {
                    // Safety net: runner normally publishes session.failed itself.
                    this.bus.publish({
                        type: 'session.failed',
                        sessionId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
            finally {
                // Give SSE subscribers a moment to receive final events before GC.
                setTimeout(() => this.bus.closeSession(sessionId), 30_000);
                this.aborts.delete(sessionId);
            }
        })();
    }
    cancel(sessionId) {
        const ac = this.aborts.get(sessionId);
        if (!ac)
            return false;
        ac.abort();
        return true;
    }
    isRunning(sessionId) {
        return this.aborts.has(sessionId);
    }
}
export function newSessionId() {
    return randomUUID();
}
//# sourceMappingURL=session-manager.js.map