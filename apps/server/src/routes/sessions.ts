/** Session routes: create (starts deliberation), inspect, cancel, SSE stream. */
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { DB } from '../db/connection.js'
import { AppError } from '../lib/errors.js'
import { sessionCreateSchema } from '@opencouncil/shared'
import type { SessionBus } from '../engine/bus.js'
import type { SessionManager } from '../engine/session-manager.js'
import { logActivity, messageToDTO, sessionToDTO } from './mappers.js'

export interface SessionRouteDeps {
  db: DB
  bus: SessionBus
  sessions: SessionManager
}

export function registerSessionRoutes(app: FastifyInstance, deps: SessionRouteDeps): void {
  const { db, bus, sessions } = deps

  app.get('/api/v1/sessions', async (req) => {
    const { status, limit } = req.query as { status?: string; limit?: string }
    const lim = Math.min(Math.max(parseInt(limit ?? '100', 10) || 100, 1), 500)
    const rows = (
      status
        ? db.prepare(
            `SELECT s.*, c.name AS council_name,
             (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
             FROM sessions s JOIN councils c ON c.id = s.council_id
             WHERE s.status = ? ORDER BY s.created_at DESC LIMIT ?`,
          ).all(status, lim)
        : db.prepare(
            `SELECT s.*, c.name AS council_name,
             (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
             FROM sessions s JOIN councils c ON c.id = s.council_id
             ORDER BY s.created_at DESC LIMIT ?`,
          ).all(lim)
    ) as never[]
    return (rows as never[]).map((r) => sessionToDTO(r as never))
  })

  app.post('/api/v1/sessions', async (req, reply) => {
    const body = sessionCreateSchema.parse(req.body)
    const council = db.prepare('SELECT id FROM councils WHERE id = ?').get(body.councilId)
    if (!council) throw new AppError(404, 'not_found', 'council not found')

    const id = randomUUID()
    db.prepare(`INSERT INTO sessions (id, council_id, topic, status) VALUES (?, ?, ?, 'queued')`).run(
      id,
      body.councilId,
      body.topic,
    )
    logActivity(db, 'session.started', { sessionId: id, councilId: body.councilId })
    sessions.startSession(id, body.councilId, body.topic)
    reply.code(202)
    return sessionToDTO(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as never)
  })

  app.get('/api/v1/sessions/:id', async (req) => {
    const { id } = req.params as { id: string }
    const row = db
      .prepare(
        `SELECT s.*, c.name AS council_name, c.moderator_member_id
         FROM sessions s JOIN councils c ON c.id = s.council_id WHERE s.id = ?`,
      )
      .get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'session not found')

    const msgs = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(id) as never[]
    const usage = db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost_usd),0) AS cost
         FROM usage_events WHERE session_id = ? AND status = 'ok'`,
      )
      .get(id) as { calls: number; tokens: number; cost: number }

    return {
      session: sessionToDTO(row as never),
      messages: (msgs as never[]).map((m) => messageToDTO(m as never)),
      usage,
    }
  })

  app.post('/api/v1/sessions/:id/cancel', async (req) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'session not found')
    const ok = sessions.cancel(id)
    if (!ok && (row as { status: string }).status === 'queued') {
      db.prepare("UPDATE sessions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id)
    }
    return { ok: true }
  })

  app.get('/api/v1/sessions/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = db.prepare('SELECT id FROM sessions WHERE id = ?').get(id)
    if (!exists) throw new AppError(404, 'not_found', 'session not found')

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    reply.raw.write('retry: 2000\n\n')

    // Replay history so late joiners see the transcript so far.
    const existing = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(id) as Parameters<
      typeof messageToDTO
    >[0][]
    for (const m of existing) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'message.replay', sessionId: id, message: messageToDTO(m) })}\n\n`)
    }

    const unsub = bus.subscribe(id, (event) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {
        unsub()
      }
    })

    req.raw.on('close', () => unsub())
  })
}
