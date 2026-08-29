/** Activity stats: usage aggregates for the dashboard. */
import type { FastifyInstance } from 'fastify'
import { Readable } from 'node:stream'
import { z } from 'zod'
import type { DB } from '../db/connection.js'
import type { ActivityStats, DailyActivity, GroupedUsage } from '@opencouncil/shared'

const windowSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })

function activityWindow(query: unknown): { since: string; until: string; days: number } {
  const { days } = windowSchema.parse(query)
  const now = new Date()
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return { since: new Date(tomorrow - days * 86_400_000).toISOString(), until: new Date(tomorrow).toISOString(), days }
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value)
  // Quote all fields and neutralize formula-leading text, including hidden prefixes.
  // eslint-disable-next-line no-control-regex -- Detect control characters hiding a spreadsheet formula.
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@\-＝＋－＠]/u.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}

export function registerActivityRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/v1/activity/stats', async (req) => {
    const { since, until } = activityWindow(req.query)

    const totals = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM sessions WHERE created_at >= ? AND created_at < ?) AS sessions,
           (SELECT COUNT(*) FROM messages WHERE kind IN ('discussion','synthesis') AND created_at >= ? AND created_at < ?) AS messages,
           COALESCE(SUM(CASE WHEN status='ok' THEN prompt_tokens END),0) AS promptTokens,
           COALESCE(SUM(CASE WHEN status='ok' THEN completion_tokens END),0) AS completionTokens,
           COALESCE(SUM(CASE WHEN status='ok' THEN total_tokens END),0) AS totalTokens,
           COALESCE(SUM(cost_usd),0) AS costUsd,
           COALESCE(SUM(CASE WHEN status='error' THEN 1 ELSE 0 END),0) AS errors,
           COALESCE(SUM(CASE WHEN status='ok' AND cost_usd IS NULL THEN 1 ELSE 0 END),0) AS unpricedCalls
         FROM usage_events WHERE created_at >= ? AND created_at < ?`,
      )
      .get(since, until, since, until, since, until) as {
      sessions: number
      messages: number
      promptTokens: number
      completionTokens: number
      totalTokens: number
      costUsd: number
      errors: number
      unpricedCalls: number
    }

    const daily = db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day,
                COALESCE(SUM(total_tokens), 0) AS tokens,
                COALESCE(SUM(cost_usd), 0) AS costUsd
         FROM usage_events
         WHERE created_at >= ? AND created_at < ? AND status='ok'
         GROUP BY day ORDER BY day`,
      )
      .all(since, until) as unknown as DailyActivity[]

    function grouped(column: 'member_name' | 'model_name' | 'provider_name'): GroupedUsage[] {
      return db
        .prepare(
          `SELECT COALESCE(${column}, 'unknown') AS name,
                  COALESCE(SUM(total_tokens), 0) AS tokens,
                  COUNT(*) AS messages,
                  COALESCE(SUM(cost_usd), 0) AS costUsd
           FROM usage_events WHERE status = 'ok' AND created_at >= ? AND created_at < ?
           GROUP BY name ORDER BY tokens DESC LIMIT 20`,
        )
        .all(since, until) as unknown as GroupedUsage[]
    }

    const recentLog = db
      .prepare('SELECT * FROM activity_log WHERE created_at >= ? AND created_at < ? ORDER BY id DESC LIMIT 100')
      .all(since, until) as {
      id: number
      action: string
      detail: string | null
      created_at: string
    }[]

    const stats: ActivityStats = {
      totals: { ...totals, costUsd: Number(totals.costUsd.toFixed(4)) },
      daily,
      byMember: grouped('member_name'),
      byModel: grouped('model_name'),
      byProvider: grouped('provider_name'),
    }

    return { ...stats, recentLog, window: { since, until } }
  })

  app.get('/api/v1/activity/export', async (req, reply) => {
    const { since, until, days } = activityWindow(req.query)
    const columns = [
      'id',
      'session_id',
      'created_at',
      'member_name',
      'provider_name',
      'model_name',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'cost_usd',
      'latency_ms',
      'retry_count',
      'error_code',
      'status',
    ]
    const maxId = (db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM usage_events').get() as { id: number }).id
    async function* rows() {
      yield columns.map(csvCell).join(',') + '\r\n'
      let cursor = 0
      while (cursor < maxId) {
        const batch = db
          .prepare(
            `SELECT ${columns.join(',')} FROM usage_events
          WHERE created_at >= ? AND created_at < ? AND id > ? AND id <= ? ORDER BY id LIMIT 1000`,
          )
          .all(since, until, cursor, maxId) as Record<string, unknown>[]
        if (!batch.length) break
        yield batch.map((row) => columns.map((col) => csvCell(row[col])).join(',')).join('\r\n') + '\r\n'
        cursor = Number(batch[batch.length - 1]!.id)
      }
    }
    reply.header('Content-Disposition', `attachment; filename="opencouncil-usage-${days}d.csv"`)
    reply.header('Cache-Control', 'no-store')
    reply.type('text/csv; charset=utf-8')
    return reply.send(Readable.from(rows()))
  })
}
