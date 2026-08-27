/** Session lifecycle manager: create, run async, cancel, track aborts. */
import { randomUUID } from 'node:crypto'
import type { SessionBus } from './bus.js'
import { SessionCancelled, type SessionRunner } from './runner.js'

export class SessionManager {
  private aborts = new Map<string, AbortController>()
  private pending: Array<{ sessionId: string; councilId: string; topic: string }> = []
  private active = 0

  constructor(
    private bus: SessionBus,
    private runner: SessionRunner,
    private maxConcurrentSessions = 4,
  ) {}

  /** Kicks off deliberation for a pre-created session row. */
  startSession(sessionId: string, councilId: string, topic: string): void {
    if (this.active >= this.maxConcurrentSessions) {
      this.pending.push({ sessionId, councilId, topic })
      return
    }
    this.runSession(sessionId, councilId, topic)
  }

  private runSession(sessionId: string, councilId: string, topic: string): void {
    const ac = new AbortController()
    this.aborts.set(sessionId, ac)
    this.active++

    const runner = this.runner

    void (async () => {
      try {
        await runner.run(sessionId, councilId, topic, ac.signal)
        // terminal events (completed/failed/cancelled) already published by runner
      } catch (err) {
        // Runner owns persistence and terminal lifecycle events. The manager only
        // keeps the process alive if an unexpected exception escapes.
        if (!(err instanceof SessionCancelled)) return
      } finally {
        // Give SSE subscribers a moment to receive final events before GC.
        setTimeout(() => this.bus.closeSession(sessionId), 30_000)
        this.aborts.delete(sessionId)
        this.active--
        const next = this.pending.shift()
        if (next) this.runSession(next.sessionId, next.councilId, next.topic)
      }
    })()
  }

  cancel(sessionId: string): boolean {
    const pendingIndex = this.pending.findIndex((job) => job.sessionId === sessionId)
    if (pendingIndex >= 0) {
      this.pending.splice(pendingIndex, 1)
      return false
    }
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
