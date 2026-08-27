/** Provider + model CRUD routes. */
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { DB } from '../db/connection.js'
import { encryptSecret } from '../vault/crypto.js'
import { AppError } from '../lib/errors.js'
import {
  catalogEnrollSchema,
  modelCreateSchema,
  modelUpdateSchema,
  providerCreateSchema,
  providerUpdateSchema,
} from '@opencouncil/shared'
import { logActivity, modelToDTO, providerToDTO } from './mappers.js'
import { getAdapter } from '../providers/registry.js'
import { decryptSecret } from '../vault/crypto.js'
import { fetchProviderCatalog } from '../providers/catalog.js'
import { mapProviderError } from '../lib/errors.js'

const PROVIDER_PRESETS: Record<string, { protocol: string; baseUrl?: string }> = {
  openai: { protocol: 'openai_compatible', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { protocol: 'openai_compatible', baseUrl: 'https://openrouter.ai/api/v1' },
  groq: { protocol: 'openai_compatible', baseUrl: 'https://api.groq.com/openai/v1' },
  together: { protocol: 'openai_compatible', baseUrl: 'https://api.together.xyz/v1' },
  deepseek: { protocol: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1' },
  mistral: { protocol: 'openai_compatible', baseUrl: 'https://api.mistral.ai/v1' },
  xai: { protocol: 'openai_compatible', baseUrl: 'https://api.x.ai/v1' },
  ollama: { protocol: 'openai_compatible', baseUrl: 'http://localhost:11434/v1' },
  lmstudio: { protocol: 'openai_compatible', baseUrl: 'http://localhost:1234/v1' },
  vllm: { protocol: 'openai_compatible' },
  anthropic: { protocol: 'anthropic' },
  google: { protocol: 'google' },
}

export function registerProviderRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/v1/meta/providers', async () => ({
    protocols: ['openai_compatible', 'anthropic', 'google', 'mock'],
    presets: Object.entries(PROVIDER_PRESETS).map(([key, v]) => ({ key, ...v })),
  }))

  app.post('/api/v1/providers/:id/test', async (req) => {
    const { id } = req.params as { id: string }
    const provider = db.prepare('SELECT * FROM providers WHERE id=?').get(id) as
      | {
          protocol: 'openai_compatible' | 'anthropic' | 'google' | 'mock'
          base_url: string | null
          api_key_encrypted: string | null
          default_model_id: string | null
        }
      | undefined
    if (!provider) throw new AppError(404, 'not_found', 'provider not found')
    const model = db
      .prepare('SELECT model_id FROM models WHERE id=? OR (provider_id=? AND model_id=?) LIMIT 1')
      .get(provider.default_model_id, id, provider.default_model_id) as { model_id: string } | undefined
    if (!model) throw new AppError(400, 'no_model', 'provider has no configured model to test')
    const adapter = getAdapter(provider.protocol)
    const started = Date.now()
    try {
      await adapter.chat({
        baseUrl: provider.base_url ?? adapter.defaultBaseUrl ?? '',
        apiKey: provider.api_key_encrypted ? decryptSecret(provider.api_key_encrypted) : undefined,
        modelId: model.model_id,
        messages: [{ role: 'user', content: 'Respond with the single word OK.' }],
        maxTokens: 8,
        timeoutMs: 15_000,
      })
      return { ok: true, latencyMs: Date.now() - started, errorCode: null, message: 'connection successful' }
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        errorCode:
          error instanceof Error && /auth|401|403|key/i.test(error.message)
            ? 'authentication_failed'
            : 'connection_failed',
        message: 'provider connection failed',
      }
    }
  })

  async function catalogForProvider(id: string) {
    const provider = db.prepare('SELECT * FROM providers WHERE id=?').get(id) as
      | {
          id: string
          name: string
          protocol: 'openai_compatible' | 'anthropic' | 'google' | 'mock'
          base_url: string | null
          api_key_encrypted: string | null
        }
      | undefined
    if (!provider) throw new AppError(404, 'not_found', 'provider not found')
    try {
      const catalog = await fetchProviderCatalog({
        protocol: provider.protocol,
        name: provider.name,
        baseUrl: provider.base_url,
        apiKey: provider.api_key_encrypted ? decryptSecret(provider.api_key_encrypted) : null,
      })
      const enrolled = new Set(
        (
          db.prepare('SELECT model_id FROM models WHERE provider_id=?').all(id) as {
            model_id: string
          }[]
        ).map((r) => r.model_id),
      )
      return {
        ...catalog,
        models: catalog.models.map((m) => ({ ...m, enrolled: enrolled.has(m.modelId) })),
      }
    } catch (err) {
      throw mapProviderError(err)
    }
  }

  app.get('/api/v1/providers/:id/catalog', async (req) => {
    const { id } = req.params as { id: string }
    return catalogForProvider(id)
  })

  app.post('/api/v1/providers/:id/discover-models', async (req) => {
    const { id } = req.params as { id: string }
    return catalogForProvider(id)
  })

  app.post('/api/v1/providers/:id/catalog/enroll', async (req) => {
    const { id } = req.params as { id: string }
    const body = catalogEnrollSchema.parse(req.body ?? {})
    const catalog = await catalogForProvider(id)
    if (!catalog.supported) throw new AppError(400, 'unsupported', catalog.reason || 'catalog unavailable')
    const wanted = new Set(body.modelIds)
    const picks = catalog.models.filter((m) => wanted.has(m.modelId))
    if (picks.length === 0) throw new AppError(400, 'not_found', 'none of those model ids are in the live catalog')

    let created = 0
    let updated = 0
    db.exec('BEGIN')
    try {
      const insert = db.prepare(
        `INSERT INTO models (id, provider_id, model_id, display_name, context_window, input_per_mtok_usd, output_per_mtok_usd, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      const update = db.prepare(
        `UPDATE models SET display_name=?, context_window=?, input_per_mtok_usd=?, output_per_mtok_usd=?
         WHERE provider_id=? AND model_id=?`,
      )
      const existing = db.prepare('SELECT id FROM models WHERE provider_id=? AND model_id=?')
      for (const m of picks) {
        const row = existing.get(id, m.modelId) as { id: string } | undefined
        if (row) {
          update.run(m.displayName.slice(0, 120), m.contextWindow, m.inputPerMTokUsd, m.outputPerMTokUsd, id, m.modelId)
          updated++
        } else {
          insert.run(
            randomUUID(),
            id,
            m.modelId,
            m.displayName.slice(0, 120),
            m.contextWindow,
            m.inputPerMTokUsd,
            m.outputPerMTokUsd,
          )
          created++
        }
      }
      logActivity(db, 'models.enrolled', { providerId: id, created, updated })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    const models = (
      db.prepare('SELECT * FROM models WHERE provider_id=? ORDER BY display_name').all(id) as Parameters<
        typeof modelToDTO
      >[0][]
    ).map(modelToDTO)
    return { created, updated, models }
  })

  app.get('/api/v1/providers', async () => {
    const rows = db.prepare('SELECT * FROM providers ORDER BY created_at').all() as Parameters<
      typeof providerToDTO
    >[0][]
    return rows.map(providerToDTO)
  })

  app.post('/api/v1/providers', async (req, reply) => {
    const body = providerCreateSchema.parse(req.body)
    const id = randomUUID()
    db.prepare(
      `INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, default_model_id, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.name,
      body.protocol,
      body.baseUrl ?? null,
      body.apiKey ? encryptSecret(body.apiKey) : null,
      body.defaultModelId ?? null,
      body.enabled === false ? 0 : 1,
    )
    logActivity(db, 'provider.created', { id, name: body.name })
    reply.code(201)
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as never
    return providerToDTO(row)
  })

  app.patch('/api/v1/providers/:id', async (req) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as never | undefined
    if (!row) throw new AppError(404, 'not_found', 'provider not found')
    const body = providerUpdateSchema.parse(req.body)

    const cur = row as {
      name: string
      protocol: string
      base_url: string | null
      default_model_id: string | null
      enabled: number
      api_key_encrypted: string | null
    }
    const next = {
      name: body.name ?? cur.name,
      protocol: body.protocol ?? cur.protocol,
      base_url: body.baseUrl === undefined ? cur.base_url : body.baseUrl,
      default_model_id: body.defaultModelId === undefined ? cur.default_model_id : body.defaultModelId,
      enabled: body.enabled === undefined ? cur.enabled : body.enabled ? 1 : 0,
      api_key_encrypted:
        body.apiKey === undefined
          ? cur.api_key_encrypted
          : body.apiKey === null || body.apiKey === ''
            ? null
            : encryptSecret(body.apiKey),
    }
    db.prepare(
      `UPDATE providers SET name=?, protocol=?, base_url=?, default_model_id=?, enabled=?, api_key_encrypted=?,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    ).run(next.name, next.protocol, next.base_url, next.default_model_id, next.enabled, next.api_key_encrypted, id)
    logActivity(db, 'provider.updated', { id })

    const updated = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as never
    return providerToDTO(updated)
  })

  app.delete('/api/v1/providers/:id', async (req) => {
    const { id } = req.params as { id: string }
    db.exec('BEGIN')
    try {
      db.prepare(
        `UPDATE members SET enabled = 0 WHERE model_id IN (SELECT m.id FROM models m WHERE m.provider_id = ?)`,
      ).run(id)
      db.prepare('DELETE FROM providers WHERE id = ?').run(id)
      logActivity(db, 'provider.deleted', { id })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { ok: true }
  })

  // ---- models ----
  app.get('/api/v1/models', async (req) => {
    const { providerId } = req.query as { providerId?: string }
    const rows = (
      providerId
        ? db.prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY display_name').all(providerId)
        : db.prepare('SELECT * FROM models ORDER BY display_name').all()
    ) as Parameters<typeof modelToDTO>[0][]
    return rows.map(modelToDTO)
  })

  app.post('/api/v1/models', async (req, reply) => {
    const body = modelCreateSchema.parse(req.body)
    const prov = db.prepare('SELECT id FROM providers WHERE id = ?').get(body.providerId)
    if (!prov) throw new AppError(404, 'not_found', 'provider not found')
    const id = randomUUID()
    try {
      db.prepare(
        `INSERT INTO models (id, provider_id, model_id, display_name, context_window, input_per_mtok_usd, output_per_mtok_usd, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        body.providerId,
        body.modelId,
        body.displayName,
        body.contextWindow ?? null,
        body.inputPerMTokUsd ?? null,
        body.outputPerMTokUsd ?? null,
        body.enabled === false ? 0 : 1,
      )
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        throw new AppError(409, 'duplicate', 'model already registered for this provider')
      }
      throw err
    }
    logActivity(db, 'model.created', { id, modelId: body.modelId })
    reply.code(201)
    return modelToDTO(db.prepare('SELECT * FROM models WHERE id = ?').get(id) as never)
  })

  app.patch('/api/v1/models/:id', async (req) => {
    const { id } = req.params as { id: string }
    const cur = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as never | undefined
    if (!cur) throw new AppError(404, 'not_found', 'model not found')
    const body = modelUpdateSchema.parse(req.body)
    const c = cur as {
      model_id: string
      display_name: string
      context_window: number | null
      input_per_mtok_usd: number | null
      output_per_mtok_usd: number | null
      enabled: number
    }
    db.prepare(
      `UPDATE models SET model_id=?, display_name=?, context_window=?, input_per_mtok_usd=?, output_per_mtok_usd=?, enabled=? WHERE id=?`,
    ).run(
      body.modelId ?? c.model_id,
      body.displayName ?? c.display_name,
      body.contextWindow ?? c.context_window,
      body.inputPerMTokUsd ?? c.input_per_mtok_usd,
      body.outputPerMTokUsd ?? c.output_per_mtok_usd,
      body.enabled === undefined ? c.enabled : body.enabled ? 1 : 0,
      id,
    )
    return modelToDTO(db.prepare('SELECT * FROM models WHERE id = ?').get(id) as never)
  })

  app.delete('/api/v1/models/:id', async (req) => {
    const { id } = req.params as { id: string }
    db.exec('BEGIN')
    try {
      db.prepare('UPDATE members SET enabled = 0 WHERE model_id = ?').run(id)
      db.prepare('DELETE FROM models WHERE id = ?').run(id)
      logActivity(db, 'model.deleted', { id })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { ok: true }
  })
}
