/** Session lifecycle manager: create, run async, cancel, extend, conclude, intervene, track aborts. */
import { randomUUID } from 'node:crypto'
import type { SessionBus } from './bus.js'
import { SessionCancelled, type SessionController, type SessionRunner } from './runner.js'

class ActiveSessionController implements SessionController {
  public readonly abortController = new AbortController()
  private additionalRounds = 0
  private concludeEarly = false
  private interventions: string[] = []
  private interventionCount = 0

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  shouldConcludeEarly(): boolean {
    return this.concludeEarly
  }

  getAdditionalRounds(): number {
    return this.additionalRounds
  }

  extend(rounds: number): { added: number; total: number } {
    const previous = this.additionalRounds
    this.additionalRounds = Math.min(50, previous + Math.max(1, rounds))
    return { added: this.additionalRounds - previous, total: this.additionalRounds }
  }

  conclude(): void {
    this.concludeEarly = true
  }

  intervene(content: string): void {
    if (this.interventionCount >= 50) throw new Error('Session directive limit reached (50).')
    this.interventionCount++
    this.interventions.push(content)
  }

  consumeInterventions(): string[] {
    const list = [...this.interventions]
    this.interventions = []
    return list
  }

  abort(): void {
    this.abortController.abort()
  }
}

export class SessionManager {
  private controllers = new Map<string, ActiveSessionController>()
  private pending: Array<{ sessionId: string; councilId: string; topic: string }> = []
  private active = 0

  constructor(
    private bus: SessionBus,
    private runner: SessionRunner,
    private maxConcurrentSessions = 4,
  ) {}

  /** Reject work before inserting a row; queued work is deliberately bounded. */
  assertCapacity(): void {
    if (this.pending.length >= 32)
      throw Object.assign(new Error('Session queue is full (32 waiting).'), { statusCode: 429, code: 'queue_full' })
  }

  /** Kicks off deliberation for a pre-created session row. */
  startSession(sessionId: string, councilId: string, topic: string): void {
    if (this.active >= this.maxConcurrentSessions) {
      this.pending.push({ sessionId, councilId, topic })
      return
    }
    this.runSession(sessionId, councilId, topic)
  }

  private runSession(sessionId: string, councilId: string, topic: string): void {
    const controller = new ActiveSessionController()
    this.controllers.set(sessionId, controller)
    this.active++

    const runner = this.runner

    void (async () => {
      try {
        await runner.run(sessionId, councilId, topic, controller)
        // terminal events (completed/failed/cancelled) already published by runner
      } catch (err) {
        // Runner owns persistence and terminal lifecycle events. The manager only
        // keeps the process alive if an unexpected exception escapes.
        if (!(err instanceof SessionCancelled)) return
      } finally {
        // Give SSE subscribers a moment to receive final events before GC.
        setTimeout(() => this.bus.closeSession(sessionId), 30_000)
        this.controllers.delete(sessionId)
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
    const ctrl = this.controllers.get(sessionId)
    if (!ctrl) return false
    ctrl.abort()
    return true
  }

  extendSession(sessionId: string, additionalRounds: number): { added: number; total: number } | null {
    const ctrl = this.controllers.get(sessionId)
    if (!ctrl) return null
    return ctrl.extend(additionalRounds)
  }

  concludeSession(sessionId: string, _reason?: string): boolean {
    const ctrl = this.controllers.get(sessionId)
    if (!ctrl) return false
    ctrl.conclude()
    return true
  }

  interveneSession(sessionId: string, content: string): 'ok' | 'missing' | 'limit' {
    const ctrl = this.controllers.get(sessionId)
    if (!ctrl) return 'missing'
    try {
      ctrl.intervene(content)
      return 'ok'
    } catch {
      return 'limit'
    }
  }

  isRunning(sessionId: string): boolean {
    return this.controllers.has(sessionId)
  }
}

export function newSessionId(): string {
  return randomUUID()
}
