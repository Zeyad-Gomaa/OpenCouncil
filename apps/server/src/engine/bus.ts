/** Per-session pub/sub event bus fanning out council events to SSE subscribers. */
import { EventEmitter } from 'node:events'
import type { CouncilEvent } from '@opencouncil/shared'

const HEARTBEAT_MS = 15_000

type Listener = (event: CouncilEvent) => void

export class SessionBus {
  private emitters = new Map<string, EventEmitter>()

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
    if (em) em.emit('event', event)
  }

  subscribe(sessionId: string, listener: Listener): () => void {
    const em = this.emitterFor(sessionId)
    em.on('event', listener)
    // Keep-alive heartbeat for proxies
    const hb = setInterval(() => {
      try {
        em.emit('heartbeat')
      } catch {
        /* noop */
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
  }
}
