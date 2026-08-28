/** Fastify app factory: plugins, db, engine wiring, routes. */
import Fastify, { type FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { AppConfig } from './config.js'
import type { DB } from './db/connection.js'
import type { SessionBus } from './engine/bus.js'
import type { SessionManager } from './engine/session-manager.js'
import { VERSION } from './version.js'

export interface AppDeps {
  config: AppConfig
  db: DB
  bus: SessionBus
  sessions: SessionManager
}

const INSTANCE_ID = randomUUID()

/** Engine DB callbacks used by the runner (kept here to avoid circular imports). */
export function makeRunnerDbHelpers(db: DB) {
  return {
    recordUsage(u: {
      sessionId: string
      providerId?: string | null
      memberName: string
      memberId?: string | null
      providerName: string
      modelId?: string | null
      modelName: string
      promptTokens: number
      completionTokens: number
      costUsd: number | null
      latencyMs: number
      retryCount?: number
      errorCode?: string | null
      status: 'ok' | 'error'
    }): number {
      const result = db
        .prepare(
          `INSERT INTO usage_events (session_id, provider_id, provider_name, model_id, member_id, member_name, model_name,
          prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, retry_count, error_code, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          u.sessionId,
          u.providerId ?? null,
          u.providerName || null,
          u.modelId ?? null,
          u.memberId ?? null,
          u.memberName,
          u.modelName,
          u.promptTokens,
          u.completionTokens,
          u.promptTokens + u.completionTokens,
          u.costUsd,
          u.latencyMs,
          u.retryCount ?? 0,
          u.errorCode ?? null,
          u.status,
        )
      return Number(result.lastInsertRowid)
    },
    insertMessage(m: {
      sessionId: string
      memberId: string | null
      memberName: string
      kind: 'discussion' | 'synthesis' | 'system' | 'user'
      round: number
      roundPosition?: number
      content: string
    }): number {
      const role = m.kind === 'user' ? 'user' : 'assistant'
      const info = db
        .prepare(
          `INSERT INTO messages (session_id, member_id, member_name, role, kind, round, round_position, content)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(m.sessionId, m.memberId, m.memberName, role, m.kind, m.round, m.roundPosition ?? 0, m.content)
      return Number(info.lastInsertRowid)
    },
    loadCouncil(councilId: string) {
      const c = db.prepare('SELECT * FROM councils WHERE id = ?').get(councilId) as
        | {
            id: string
            name: string
            strategy: 'round_robin' | 'debate' | 'swarm' | 'critique' | 'review' | 'architect' | 'red_team'
            rounds: number
            moderator_member_id: string | null
          }
        | undefined
      if (!c) return null
      const members = db
        .prepare(
          `SELECT mem.* FROM members mem JOIN council_members cm ON cm.member_id = mem.id AND cm.council_id = ?
           ORDER BY cm.position`,
        )
        .all(councilId) as {
        id: string
        name: string
        model_id: string | null
        system_prompt: string | null
        temperature: number
        max_tokens: number | null
        avatar_color: string
        enabled: number
      }[]
      return {
        id: c.id,
        name: c.name,
        strategy: c.strategy,
        rounds: c.rounds,
        moderatorMemberId: c.moderator_member_id,
        members: members.map((r) => ({
          id: r.id,
          name: r.name,
          modelId: r.model_id ?? '',
          systemPrompt: r.system_prompt,
          temperature: r.temperature,
          maxTokens: r.max_tokens,
          avatarColor: r.avatar_color,
          enabled: !!r.enabled,
        })),
      }
    },
    loadModelForChat(modelId: string) {
      const row = db
        .prepare(
          `SELECT m.model_id AS modelId, m.id AS stableModelId, p.id AS providerId, p.name AS providerName,
                  m.display_name AS modelName, m.context_window AS contextWindow, p.protocol AS providerProtocol, p.base_url AS providerBaseUrl,
                  p.api_key_encrypted AS apiKeyEncrypted, m.input_per_mtok_usd AS inputPerMTokUsd,
                  m.output_per_mtok_usd AS outputPerMTokUsd
           FROM models m JOIN providers p ON p.id = m.provider_id WHERE m.id = ?`,
        )
        .get(modelId) as
        | {
            modelId: string
            stableModelId: string
            providerId: string
            providerName: string
            modelName: string
            contextWindow: number | null
            providerProtocol: 'openai_compatible' | 'anthropic' | 'google' | 'mock'
            providerBaseUrl: string | null
            apiKeyEncrypted: string | null
            inputPerMTokUsd: number | null
            outputPerMTokUsd: number | null
          }
        | undefined
      return row ?? null
    },
    loadWorkspace(sessionId: string): { root: string; files: string[] } | null {
      const row = db.prepare('SELECT workspace_path, workspace_files_json FROM sessions WHERE id=?').get(sessionId) as
        | { workspace_path: string | null; workspace_files_json: string | null }
        | undefined
      if (!row?.workspace_path) return null
      let files: string[] = []
      if (row.workspace_files_json) {
        try {
          const parsed = JSON.parse(row.workspace_files_json) as unknown
          if (Array.isArray(parsed)) files = parsed.filter((x): x is string => typeof x === 'string')
        } catch {
          files = []
        }
      }
      return { root: row.workspace_path, files }
    },
    updateSessionStatus(
      sessionId: string,
      status: 'running' | 'completed' | 'failed' | 'cancelled',
      error?: string,
    ): void {
      if (status === 'running') {
        db.prepare(
          `UPDATE sessions SET status='running', started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        ).run(sessionId)
      } else {
        db.prepare(
          `UPDATE sessions SET status=?, completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), error=COALESCE(?, error) WHERE id=?`,
        ).run(status, error ?? null, sessionId)
      }
    },
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: deps.config.logLevel }, ignoreTrailingSlash: true })

  const { registerErrorHandlers } = await import('./lib/errors.js')
  registerErrorHandlers(app)
  app.get('/api/v1/health', async () => ({ ok: true, version: VERSION, instanceId: INSTANCE_ID }))
  app.get('/api/v1/system/health', async () => ({ ok: true, version: VERSION, instanceId: INSTANCE_ID }))
  app.get('/api/v1/system/info', async () => ({
    version: VERSION,
    instanceId: INSTANCE_ID,
    uptimeSeconds: Math.floor(process.uptime()),
    providers: Number(
      (deps.db.prepare('SELECT COUNT(*) AS n FROM providers WHERE enabled=1').get() as { n: number }).n,
    ),
    models: Number((deps.db.prepare('SELECT COUNT(*) AS n FROM models WHERE enabled=1').get() as { n: number }).n),
    members: Number((deps.db.prepare('SELECT COUNT(*) AS n FROM members WHERE enabled=1').get() as { n: number }).n),
    councils: Number((deps.db.prepare('SELECT COUNT(*) AS n FROM councils').get() as { n: number }).n),
    runningSessions: Number(
      (
        deps.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE status IN ('queued','running')").get() as {
          n: number
        }
      ).n,
    ),
  }))

  const { registerProviderRoutes } = await import('./routes/providers.js')
  registerProviderRoutes(app, deps.db)

  const { registerMemberCouncilRoutes } = await import('./routes/councils.js')
  registerMemberCouncilRoutes(app, deps.db)

  const { registerSessionRoutes } = await import('./routes/sessions.js')
  registerSessionRoutes(app, { db: deps.db, bus: deps.bus, sessions: deps.sessions })

  const { registerActivityRoutes } = await import('./routes/activity.js')
  registerActivityRoutes(app, deps.db)
  const { registerConfigRoutes } = await import('./routes/config.js')
  registerConfigRoutes(app, deps.db)

  return app
}
