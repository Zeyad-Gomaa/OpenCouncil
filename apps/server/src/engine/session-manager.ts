/** Session lifecycle manager: create, run async, cancel, track aborts. */
import { randomUUID } from 'node:crypto'
import type { SessionBus } from './bus.js'
import { SessionCancelled, type SessionRunner } from './runner.js'

export class SessionManager {
  private aborts = new Map<string, AbortController>()

  constructor(
    private bus: SessionBus,
    private runner: SessionRunner,
  ) {}

  /** Kicks off deliberation for a pre-created session row. */
  startSession(sessionId: string, councilId: string, topic: string): void {
    const ac = new AbortController()
    this.aborts.set(sessionId, ac)

    const runner = this.runner

    void (async () => {
      try {
        await runner.run(sessionId, councilId, topic, ac.signal)
        // terminal events (completed/failed/cancelled) already published by runner
      } catch (err) {
        if (!(err instanceof SessionCancelled)) {
          // Safety net: runner normally publishes session.failed itself.
          this.bus.publish({
            type: 'session.failed',
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        // Give SSE subscribers a moment to receive final events before GC.
        setTimeout(() => this.bus.closeSession(sessionId), 30_000)
        this.aborts.delete(sessionId)
      }
    })()
  }

  cancel(sessionId: string): boolean {
    const ac = this.aborts.get(sessionId)
    if (!ac) return false
    ac.abort()
    return true
  }

  isRunning(sessionId: string): boolean {
    return this.aborts.has(sessionId)
  }
}

export function newSessionId(): string {
  return randomUUID()
}
