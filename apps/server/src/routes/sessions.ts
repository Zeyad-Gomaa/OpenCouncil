/** Session routes: create (starts deliberation), inspect, cancel, SSE stream. */
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { DB } from '../db/connection.js'
import { AppError } from '../lib/errors.js'
import {
  sessionConcludeSchema,
  sessionCreateSchema,
  sessionExtendSchema,
  sessionInterveneSchema,
  workspacePreviewSchema,
} from '@opencouncil/shared'
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

  app.post('/api/v1/workspace/preview', async (req) => {
    const body = workspacePreviewSchema.parse(req.body)
    const { buildWorkspaceBriefing, listTree, normalizeWorkspace } = await import('../engine/workspace.js')
    try {
      const ref = normalizeWorkspace(body.path, body.files ?? [])
      const tree = listTree(ref.root).slice(0, 80)
      const brief = buildWorkspaceBriefing(ref)
      return { ok: true, root: ref.root, files: ref.files, tree, fileCount: tree.length, preview: brief.slice(0, 2500) }
    } catch (err) {
      throw new AppError(400, 'workspace_invalid', err instanceof Error ? err.message : String(err))
    }
  })

  function snapshotForCouncil(councilId: string): string {
    const council = db
      .prepare('SELECT id, name, description, strategy, rounds, moderator_member_id FROM councils WHERE id = ?')
      .get(councilId) as Record<string, unknown> | undefined
    if (!council) throw new AppError(404, 'not_found', 'council not found')
    const members = db
      .prepare(
        `SELECT mem.id, mem.name, mem.system_prompt, mem.temperature, mem.max_tokens,
      mem.avatar_color, mem.enabled, m.id AS model_id, m.model_id AS model_name, m.display_name,
      p.id AS provider_id, p.name AS provider_name
      FROM council_members cm JOIN members mem ON mem.id = cm.member_id
      LEFT JOIN models m ON m.id = mem.model_id LEFT JOIN providers p ON p.id = m.provider_id
      WHERE cm.council_id = ? ORDER BY cm.position`,
      )
      .all(councilId)
    return JSON.stringify({ ...council, members })
  }

  app.get('/api/v1/sessions', async (req) => {
    const q = req.query as {
      status?: string
      councilId?: string
      search?: string
      createdAfter?: string
      createdBefore?: string
      cursor?: string
      limit?: string
    }
    const lim = Math.min(Math.max(parseInt(q.limit ?? '100', 10) || 100, 1), 500)
    const where: string[] = []
    const params: unknown[] = []
    if (q.status) {
      where.push('s.status = ?')
      params.push(q.status)
    }
    if (q.councilId) {
      where.push('s.council_id = ?')
      params.push(q.councilId)
    }
    if (q.search) {
      where.push('(s.topic LIKE ? OR c.name LIKE ?)')
      params.push(`%${q.search}%`, `%${q.search}%`)
    }
    if (q.createdAfter) {
      where.push('s.created_at >= ?')
      params.push(q.createdAfter)
    }
    if (q.createdBefore) {
      where.push('s.created_at <= ?')
      params.push(q.createdBefore)
    }
    if (q.cursor) {
      where.push('s.created_at < ?')
      params.push(q.cursor)
    }
    const rows = db
      .prepare(
        `SELECT s.*, COALESCE(c.name, json_extract(s.snapshot_json, '$.name')) AS council_name,
      (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
      FROM sessions s LEFT JOIN councils c ON c.id = s.council_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.created_at DESC LIMIT ?`,
      )
      .all(...params, lim) as never[]
    return (rows as never[]).map((r) => sessionToDTO(r as never))
  })

  app.post('/api/v1/sessions', async (req, reply) => {
    const body = sessionCreateSchema.parse(req.body)
    const council = db.prepare('SELECT id FROM councils WHERE id = ?').get(body.councilId)
    if (!council) throw new AppError(404, 'not_found', 'council not found')

    let workspacePath: string | null = null
    let workspaceFilesJson: string | null = null
    if (body.workspacePath?.trim()) {
      try {
        const { normalizeWorkspace } = await import('../engine/workspace.js')
        const ref = normalizeWorkspace(body.workspacePath, body.workspaceFiles ?? [])
        workspacePath = ref.root
        workspaceFilesJson = ref.files.length ? JSON.stringify(ref.files) : null
      } catch (err) {
        throw new AppError(400, 'workspace_invalid', err instanceof Error ? err.message : String(err))
      }
    }

    const id = randomUUID()
    const snapshot = snapshotForCouncil(body.councilId)
    db.prepare(
      `INSERT INTO sessions (id, council_id, topic, status, snapshot_json, workspace_path, workspace_files_json)
       VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    ).run(id, body.councilId, body.topic, snapshot, workspacePath, workspaceFilesJson)
    logActivity(db, 'session.started', { sessionId: id, councilId: body.councilId })
    sessions.startSession(id, body.councilId, body.topic)
    reply.code(202)
    return sessionToDTO(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as never)
  })

  app.get('/api/v1/sessions/:id', async (req) => {
    const { id } = req.params as { id: string }
    const row = db
      .prepare(
        `SELECT s.*, COALESCE(c.name, json_extract(s.snapshot_json, '$.name')) AS council_name,
         COALESCE(c.moderator_member_id, json_extract(s.snapshot_json, '$.moderator_member_id')) AS moderator_member_id
         FROM sessions s LEFT JOIN councils c ON c.id = s.council_id WHERE s.id = ?`,
      )
      .get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'session not found')

    const msgs = db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY round, round_position, id')
      .all(id) as never[]
    const usage = db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost_usd),0) AS cost
         FROM usage_events WHERE session_id = ? AND status = 'ok'`,
      )
      .get(id) as { calls: number; tokens: number; cost: number }
    const lastEventSequence = Number(
      (
        db.prepare('SELECT COALESCE(MAX(sequence),0) AS sequence FROM session_events WHERE session_id=?').get(id) as {
          sequence: number
        }
      ).sequence,
    )

    return {
      session: sessionToDTO(row as never),
      messages: (msgs as never[]).map((m) => messageToDTO(m as never)),
      usage,
      lastEventSequence,
    }
  })

  app.post('/api/v1/sessions/:id/cancel', async (req) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'session not found')
    const ok = sessions.cancel(id)
    if (!ok && (row as { status: string }).status === 'queued') {
      db.prepare(
        "UPDATE sessions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      ).run(id)
    }
    return { ok: true }
  })

  app.post('/api/v1/sessions/:id/extend', async (req) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'session not found')
    const body = sessionExtendSchema.parse(req.body ?? {})
    const ok = sessions.extendSession(id, body.additionalRounds)
    if (!ok) throw new AppError(400, 'invalid_state', 'session is not currently running')
    logActivity(db, 'session.extended', { sessionId: id, additionalRounds: body.additionalRounds })
    return { ok: true, extendedRounds: body.additionalRounds }
  })

  app.post('/api/v1/sessions/:id/conclude', async (req) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'session not found')
    const body = sessionConcludeSchema.parse(req.body ?? {})
    const ok = sessions.concludeSession(id, body.reason)
    if (!ok) throw new AppError(400, 'invalid_state', 'session is not currently running')
    logActivity(db, 'session.concluding', { sessionId: id, reason: body.reason })
    return { ok: true }
  })

  app.post('/api/v1/sessions/:id/intervene', async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'session not found')
    const body = sessionInterveneSchema.parse(req.body)
    const ok = sessions.interveneSession(id, body.content)
    if (!ok) throw new AppError(400, 'invalid_state', 'session is not currently running')

    const lastRound = Number(
      (
        db.prepare('SELECT COALESCE(MAX(round), 0) AS max_round FROM messages WHERE session_id = ?').get(id) as {
          max_round: number
        }
      ).max_round,
    )
    const msgId = db
      .prepare(
        `INSERT INTO messages (session_id, member_id, member_name, role, kind, round, round_position, content)
         VALUES (?, NULL, 'You (Directive)', 'user', 'user', ?, 99, ?)`,
      )
      .run(id, lastRound || 1, body.content).lastInsertRowid

    const msgDTO = {
      id: String(msgId),
      sessionId: id,
      memberId: null,
      memberName: 'You (Directive)',
      role: 'user' as const,
      kind: 'user' as const,
      round: lastRound || 1,
      content: body.content,
      createdAt: new Date().toISOString(),
    }
    bus.publish({
      type: 'message.created',
      sessionId: id,
      message: msgDTO,
    })

    logActivity(db, 'session.intervened', { sessionId: id })
    reply.code(201)
    return msgDTO
  })

  app.post('/api/v1/sessions/:id/clone', async (req, reply) => {
    const { id } = req.params as { id: string }
    const source = db
      .prepare('SELECT council_id, topic, snapshot_json, workspace_path, workspace_files_json FROM sessions WHERE id=?')
      .get(id) as
      | {
          council_id: string
          topic: string
          snapshot_json: string | null
          workspace_path: string | null
          workspace_files_json: string | null
        }
      | undefined
    if (!source) throw new AppError(404, 'not_found', 'session not found')
    const cloneId = randomUUID()
    db.prepare(
      `INSERT INTO sessions (id, council_id, topic, status, snapshot_json, workspace_path, workspace_files_json)
       VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    ).run(
      cloneId,
      source.council_id,
      source.topic,
      source.snapshot_json,
      source.workspace_path,
      source.workspace_files_json,
    )
    sessions.startSession(cloneId, source.council_id, source.topic)
    reply.code(202)
    return sessionToDTO(db.prepare('SELECT * FROM sessions WHERE id=?').get(cloneId) as never)
  })

  app.post('/api/v1/sessions/:id/rerun', async (req, reply) => {
    const { id } = req.params as { id: string }
    const source = db
      .prepare('SELECT council_id, topic, snapshot_json, workspace_path, workspace_files_json FROM sessions WHERE id=?')
      .get(id) as
      | {
          council_id: string
          topic: string
          snapshot_json: string | null
          workspace_path: string | null
          workspace_files_json: string | null
        }
      | undefined
    if (!source) throw new AppError(404, 'not_found', 'session not found')
    const rerunId = randomUUID()
    db.prepare(
      `INSERT INTO sessions (id, council_id, topic, status, snapshot_json, workspace_path, workspace_files_json)
       VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    ).run(
      rerunId,
      source.council_id,
      source.topic,
      source.snapshot_json,
      source.workspace_path,
      source.workspace_files_json,
    )
    sessions.startSession(rerunId, source.council_id, source.topic)
    reply.code(202)
    return sessionToDTO(db.prepare('SELECT * FROM sessions WHERE id=?').get(rerunId) as never)
  })

  app.get('/api/v1/sessions/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { format = 'json' } = req.query as { format?: string }
    const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'session not found')
    const messages = db
      .prepare('SELECT * FROM messages WHERE session_id=? ORDER BY round, round_position, id')
      .all(id) as never[]
    if (format === 'markdown') {
      const session = row as { topic: string; status: string }
      reply.type('text/markdown; charset=utf-8')
      return `# OpenCouncil Session\n\n**Status:** ${session.status}\n\n## Question\n\n${session.topic}\n\n## Transcript\n\n${messages.map((m) => `### ${(m as { member_name: string }).member_name}\n\n${(m as { content: string }).content}`).join('\n\n')}`
    }
    if (format === 'jsonl') {
      reply.type('application/jsonl')
      return messages.map((m) => JSON.stringify(m)).join('\n')
    }
    if (format !== 'json') throw new AppError(400, 'invalid_format', 'format must be json, jsonl, or markdown')
    return { session: row, messages }
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

    const { after } = req.query as { after?: string }
    const lastId = Number(req.headers['last-event-id'] ?? after ?? 0)
    const durable = db
      .prepare(
        'SELECT sequence, payload_json FROM session_events WHERE session_id = ? AND sequence > ? ORDER BY sequence',
      )
      .all(id, Number.isFinite(lastId) ? lastId : 0) as { sequence: number; payload_json: string }[]
    for (const event of durable) reply.raw.write(`id: ${event.sequence}\ndata: ${event.payload_json}\n\n`)
    if (durable.length === 0) {
      const existing = db
        .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY round, round_position, id')
        .all(id) as Parameters<typeof messageToDTO>[0][]
      for (const m of existing)
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'message.replay', sessionId: id, message: messageToDTO(m) })}\n\n`,
        )
    }

    const unsub = bus.subscribe(
      id,
      (event, sequence) => {
        try {
          reply.raw.write(`id: ${sequence ?? ''}\ndata: ${JSON.stringify(event)}\n\n`)
        } catch {
          unsub()
        }
      },
      () => reply.raw.write(': heartbeat\n\n'),
    )

    req.raw.on('close', () => unsub())
  })
}
