/** Member + council CRUD routes. */
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { DB } from '../db/connection.js'
import { AppError } from '../lib/errors.js'
import { councilCreateSchema, councilUpdateSchema, memberCreateSchema, memberUpdateSchema } from '@opencouncil/shared'
import { councilToDTO, logActivity, memberToDTO } from './mappers.js'

const MEMBER_JOIN = `
  SELECT mem.*, m.display_name AS model_display_name, p.name AS provider_name
  FROM members mem
  LEFT JOIN models m ON m.id = mem.model_id
  LEFT JOIN providers p ON p.id = m.provider_id`

function listMembers(db: DB) {
  return db.prepare(`${MEMBER_JOIN} ORDER BY mem.created_at`).all() as never[] as ReturnType<typeof memberToDTO>[]
}

function councilMembers(db: DB, councilId: string) {
  return db
    .prepare(
      `${MEMBER_JOIN} JOIN council_members cm ON cm.member_id = mem.id AND cm.council_id = ? ORDER BY cm.position`,
    )
    .all(councilId) as never[] as ReturnType<typeof memberToDTO>[]
}

export function registerMemberCouncilRoutes(app: FastifyInstance, db: DB): void {
  // ---- members ----
  app.get('/api/v1/members', async () => listMembers(db))

  app.post('/api/v1/members', async (req, reply) => {
    const body = memberCreateSchema.parse(req.body)
    const model = db.prepare('SELECT id FROM models WHERE id = ?').get(body.modelId)
    if (!model) throw new AppError(404, 'not_found', 'model not found')
    const id = randomUUID()
    db.prepare(
      `INSERT INTO members (id, name, model_id, system_prompt, temperature, max_tokens, avatar_color, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.name,
      body.modelId,
      body.systemPrompt ?? null,
      body.temperature ?? 0.7,
      body.maxTokens ?? null,
      body.avatarColor ?? '#c9a227',
      body.enabled === false ? 0 : 1,
    )
    logActivity(db, 'member.created', { id, name: body.name })
    reply.code(201)
    const row = db.prepare(`${MEMBER_JOIN} WHERE mem.id = ?`).get(id) as never
    return memberToDTO(row)
  })

  app.patch('/api/v1/members/:id', async (req) => {
    const { id } = req.params as { id: string }
    const cur = db.prepare('SELECT * FROM members WHERE id = ?').get(id) as never | undefined
    if (!cur) throw new AppError(404, 'not_found', 'member not found')
    const body = memberUpdateSchema.parse(req.body)
    const c = cur as {
      name: string
      model_id: string
      system_prompt: string | null
      temperature: number
      max_tokens: number | null
      avatar_color: string
      enabled: number
    }
    db.prepare(
      `UPDATE members SET name=?, model_id=?, system_prompt=?, temperature=?, max_tokens=?, avatar_color=?, enabled=? WHERE id=?`,
    ).run(
      body.name ?? c.name,
      body.modelId ?? c.model_id,
      body.systemPrompt === undefined ? c.system_prompt : body.systemPrompt,
      body.temperature ?? c.temperature,
      body.maxTokens === undefined ? c.max_tokens : body.maxTokens,
      body.avatarColor ?? c.avatar_color,
      body.enabled === undefined ? c.enabled : body.enabled ? 1 : 0,
      id,
    )
    const row = db.prepare(`${MEMBER_JOIN} WHERE mem.id = ?`).get(id) as never
    return memberToDTO(row)
  })

  app.delete('/api/v1/messages/:id', async () => {
    throw new AppError(405, 'immutable', 'messages are immutable')
  })

  app.delete('/api/v1/members/:id', async (req) => {
    const { id } = req.params as { id: string }
    db.prepare('UPDATE councils SET moderator_member_id = NULL WHERE moderator_member_id = ?').run(id)
    db.prepare('DELETE FROM members WHERE id = ?').run(id)
    logActivity(db, 'member.deleted', { id })
    return { ok: true }
  })

  // ---- councils ----
  app.get('/api/v1/councils', async () => {
    const rows = db.prepare('SELECT * FROM councils ORDER BY created_at').all() as {
      id: string
      name: string
      description: string | null
      strategy: string
      rounds: number
      moderator_member_id: string | null
      created_at: string
    }[]
    return rows.map((r) => councilToDTO(r, councilMembers(db, r.id)))
  })

  app.get('/api/v1/councils/:id', async (req) => {
    const { id } = req.params as { id: string }
    const r = db.prepare('SELECT * FROM councils WHERE id = ?').get(id) as never | undefined
    if (!r) throw new AppError(404, 'not_found', 'council not found')
    return councilToDTO(r as never, councilMembers(db, id))
  })

  app.post('/api/v1/councils', async (req, reply) => {
    const body = councilCreateSchema.parse(req.body)
    for (const mid of body.memberIds) {
      if (!db.prepare('SELECT id FROM members WHERE id = ?').get(mid)) {
        throw new AppError(404, 'not_found', `member ${mid} not found`)
      }
    }
    const id = randomUUID()
    db.exec('BEGIN')
    try {
      db.prepare(
        `INSERT INTO councils (id, name, description, strategy, rounds, moderator_member_id) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, body.name, body.description ?? null, body.strategy, body.rounds, body.moderatorMemberId ?? null)

      const insertCM = db.prepare('INSERT INTO council_members (council_id, member_id, position) VALUES (?, ?, ?)')
      body.memberIds.forEach((mid, i) => insertCM.run(id, mid, i))
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    logActivity(db, 'council.created', { id, name: body.name })
    reply.code(201)
    const row = db.prepare('SELECT * FROM councils WHERE id = ?').get(id) as never
    return councilToDTO(row as never, councilMembers(db, id))
  })

  app.patch('/api/v1/councils/:id', async (req) => {
    const { id } = req.params as { id: string }
    const cur = db.prepare('SELECT * FROM councils WHERE id = ?').get(id) as never | undefined
    if (!cur) throw new AppError(404, 'not_found', 'council not found')
    const body = councilUpdateSchema.parse(req.body)
    const c = cur as {
      name: string
      description: string | null
      strategy: string
      rounds: number
      moderator_member_id: string | null
    }

    db.exec('BEGIN')
    try {
      db.prepare(
        `UPDATE councils SET name=?, description=?, strategy=?, rounds=?, moderator_member_id=? WHERE id=?`,
      ).run(
        body.name ?? c.name,
        body.description === undefined ? c.description : body.description,
        body.strategy ?? c.strategy,
        body.rounds ?? c.rounds,
        body.moderatorMemberId === undefined ? c.moderator_member_id : body.moderatorMemberId,
        id,
      )

      if (body.memberIds) {
        for (const mid of body.memberIds) {
          if (!db.prepare('SELECT id FROM members WHERE id = ?').get(mid)) {
            throw new AppError(404, 'not_found', `member ${mid} not found`)
          }
        }
        db.prepare('DELETE FROM council_members WHERE council_id = ?').run(id)
        const insertCM = db.prepare('INSERT INTO council_members (council_id, member_id, position) VALUES (?, ?, ?)')
        body.memberIds.forEach((mid, i) => insertCM.run(id, mid, i))
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    const row = db.prepare('SELECT * FROM councils WHERE id = ?').get(id) as never
    return councilToDTO(row as never, councilMembers(db, id))
  })

  app.delete('/api/v1/councils/:id', async (req) => {
    const { id } = req.params as { id: string }
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM councils WHERE id = ?').run(id)
      logActivity(db, 'council.deleted', { id })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { ok: true }
  })
}
