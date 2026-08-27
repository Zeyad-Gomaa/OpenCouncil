import type { FastifyInstance } from 'fastify'
import { configImportSchema } from '@opencouncil/shared'
import type { DB } from '../db/connection.js'
import { AppError } from '../lib/errors.js'

export function registerConfigRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/v1/config/export', async () => {
    const councils = (
      db
        .prepare(
          'SELECT id,name,description,strategy,rounds,moderator_member_id AS moderatorMemberId FROM councils ORDER BY created_at',
        )
        .all() as Array<Record<string, unknown>>
    ).map((c) => ({
      ...c,
      memberIds: (
        db.prepare('SELECT member_id FROM council_members WHERE council_id=? ORDER BY position').all(c.id) as Array<{
          member_id: string
        }>
      ).map((m) => m.member_id),
    }))
    return {
      version: 1,
      providers: db
        .prepare(
          'SELECT id,name,protocol,base_url AS baseUrl,default_model_id AS defaultModelId,enabled,api_key_encrypted IS NOT NULL AS hasSecret FROM providers ORDER BY created_at',
        )
        .all(),
      models: db
        .prepare(
          'SELECT id,provider_id AS providerId,model_id AS modelId,display_name AS displayName,context_window AS contextWindow,input_per_mtok_usd AS inputPerMTokUsd,output_per_mtok_usd AS outputPerMTokUsd,enabled FROM models ORDER BY created_at',
        )
        .all(),
      members: db
        .prepare(
          'SELECT id,name,model_id AS modelId,system_prompt AS systemPrompt,temperature,max_tokens AS maxTokens,avatar_color AS avatarColor,enabled FROM members ORDER BY created_at',
        )
        .all(),
      councils,
    }
  })

  app.post('/api/v1/config/import', async (req) => {
    const parsed = configImportSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(
        400,
        'invalid_config',
        issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid config payload',
      )
    }
    const body = parsed.data
    db.exec('BEGIN')
    try {
      for (const p of body.providers) {
        db.prepare(
          `INSERT INTO providers (id,name,protocol,base_url,default_model_id,enabled,api_key_encrypted) VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,protocol=excluded.protocol,base_url=excluded.base_url,default_model_id=excluded.default_model_id,enabled=excluded.enabled`,
        ).run(p.id, p.name, p.protocol, p.baseUrl ?? null, p.defaultModelId ?? null, p.enabled === false ? 0 : 1)
      }
      for (const m of body.models)
        db.prepare(
          `INSERT INTO models (id,provider_id,model_id,display_name,context_window,input_per_mtok_usd,output_per_mtok_usd,enabled) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,enabled=excluded.enabled`,
        ).run(
          m.id,
          m.providerId,
          m.modelId,
          m.displayName,
          m.contextWindow ?? null,
          m.inputPerMTokUsd ?? null,
          m.outputPerMTokUsd ?? null,
          m.enabled === false ? 0 : 1,
        )
      for (const m of body.members)
        db.prepare(
          `INSERT INTO members (id,name,model_id,system_prompt,temperature,max_tokens,avatar_color,enabled) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,model_id=excluded.model_id,system_prompt=excluded.system_prompt,temperature=excluded.temperature,max_tokens=excluded.max_tokens,avatar_color=excluded.avatar_color,enabled=excluded.enabled`,
        ).run(
          m.id,
          m.name,
          m.modelId ?? null,
          m.systemPrompt ?? null,
          m.temperature ?? 0.7,
          m.maxTokens ?? null,
          m.avatarColor ?? '#c9a227',
          m.enabled === false ? 0 : 1,
        )
      for (const c of body.councils) {
        db.prepare(
          `INSERT INTO councils (id,name,description,strategy,rounds,moderator_member_id) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,strategy=excluded.strategy,rounds=excluded.rounds,moderator_member_id=excluded.moderator_member_id`,
        ).run(
          c.id,
          c.name,
          c.description ?? null,
          c.strategy ?? 'round_robin',
          c.rounds ?? 1,
          c.moderatorMemberId ?? null,
        )
        db.prepare('DELETE FROM council_members WHERE council_id=?').run(c.id)
        for (const [position, memberId] of (c.memberIds ?? []).entries())
          db.prepare('INSERT INTO council_members (council_id,member_id,position) VALUES (?,?,?)').run(
            c.id,
            memberId,
            position,
          )
      }
      db.exec('COMMIT')
      return {
        ok: true,
        imported: {
          providers: body.providers.length,
          models: body.models.length,
          members: body.members.length,
          councils: body.councils.length,
        },
        secretsImported: false,
      }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  })
}
