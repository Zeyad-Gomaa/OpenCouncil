/** Per-session pub/sub event bus fanning out council events to SSE subscribers. */
import { EventEmitter } from 'node:events'
import type { CouncilEvent } from '@opencouncil/shared'

const HEARTBEAT_MS = 15_000

type Listener = (event: CouncilEvent, sequence?: number) => void
type PersistEvent = (event: CouncilEvent, sequence: number) => void

export class SessionBus {
  private emitters = new Map<string, EventEmitter>()
  private sequences = new Map<string, number>()

  constructor(private persist?: PersistEvent) {}

  private emitterFor(sessionId: string): EventEmitter {
    let em = this.emitters.get(sessionId)
    if (!em) {
      em = new EventEmitter()
      em.setMaxListeners(50)
      this.emitters.set(sessionId, em)
    }
    return em
  }

  publish(event: CouncilEvent): void {
    const em = this.emitters.get(event.sessionId)
    const sequence = (this.sequences.get(event.sessionId) ?? 0) + 1
    this.sequences.set(event.sessionId, sequence)
    this.persist?.(event, sequence)
    if (em) em.emit('event', event, sequence)
  }

  subscribe(sessionId: string, listener: Listener, heartbeat?: () => void): () => void {
    const em = this.emitterFor(sessionId)
    em.on('event', listener)
    // Keep-alive heartbeat for proxies
    const hb = setInterval(() => {
      try {
        heartbeat?.()
      } catch {
        /* disconnected client */
      }
    }, HEARTBEAT_MS)
    return () => {
      em.off('event', listener)
      clearInterval(hb)
    }
  }

  closeSession(sessionId: string): void {
    const em = this.emitters.get(sessionId)
    if (em) em.removeAllListeners()
    this.emitters.delete(sessionId)
    this.sequences.delete(sessionId)
  }
}
