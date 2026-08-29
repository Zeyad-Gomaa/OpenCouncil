import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrate, openDatabase, type DB } from '../db/connection.js'
import { registerActivityRoutes } from '../routes/activity.js'
import { registerErrorHandlers } from '../lib/errors.js'
import type { AppConfig } from '../config.js'

let db: DB
let app: ReturnType<typeof Fastify>

beforeEach(() => {
  db = openDatabase({ databasePath: ':memory:' } as AppConfig)
  migrate(db)
  app = Fastify()
  registerErrorHandlers(app)
  registerActivityRoutes(app, db)
})

afterEach(async () => {
  await app.close()
  db.close()
})

function usage(at: string, member: string, cost: number | null, status = 'ok') {
  db.prepare(
    `INSERT OR IGNORE INTO sessions (id, council_id, topic, status, created_at) VALUES (?, 'test-council', 'test', 'completed', ?)`,
  ).run(at, at)
  db.prepare(
    `INSERT INTO messages (session_id, member_name, role, kind, round, content, created_at)
    VALUES (?, ?, 'assistant', 'discussion', 1, 'response', ?)`,
  ).run(at, member, at)
  db.prepare(
    `INSERT INTO usage_events (session_id, member_name, model_name, provider_name,
    prompt_tokens, completion_tokens, total_tokens, cost_usd, status, created_at)
    VALUES (?, ?, 'test-model', 'test-provider', 10, 20, 30, ?, ?, ?)`,
  ).run(at, member, cost, status, at)
  db.prepare('INSERT INTO activity_log (action, created_at) VALUES (?, ?)').run(member, at)
}

describe('activity reporting', () => {
  it('returns zero counts for an empty database', async () => {
    const stats = (await app.inject('/api/v1/activity/stats')).json()
    expect(stats.totals).toMatchObject({ sessions: 0, messages: 0, errors: 0, unpricedCalls: 0, costUsd: 0 })
    expect(stats.daily).toEqual([])
  })

  it('uses the same UTC calendar window for all totals, breakdowns, log entries, and exports', async () => {
    const empty = (await app.inject('/api/v1/activity/stats?days=7')).json()
    usage('2000-01-01T00:00:00.000Z', 'outside', 99)
    usage(empty.window.since, 'boundary', 0.05)
    usage(new Date().toISOString(), 'current', null)
    usage(empty.window.until, 'future', 99)
    const stats = (await app.inject('/api/v1/activity/stats?days=7')).json()
    expect(stats.totals).toMatchObject({ sessions: 2, messages: 2, totalTokens: 60, costUsd: 0.05, unpricedCalls: 1 })
    expect(stats.byMember.map((row: { name: string }) => row.name).sort()).toEqual(['boundary', 'current'])
    expect(stats.recentLog.map((row: { action: string }) => row.action).sort()).toEqual(['boundary', 'current'])
    const csv = await app.inject('/api/v1/activity/export?days=7')
    expect(csv.statusCode).toBe(200)
    expect(csv.headers['content-disposition']).toContain('opencouncil-usage-7d.csv')
    expect(csv.body).toContain('boundary')
    expect(csv.body).not.toMatch(/outside|future/)
  })

  it('quotes CSV cells and neutralizes formula-leading names without exporting prompts or secrets', async () => {
    usage(new Date().toISOString(), '=HYPERLINK("unsafe"),\nnext', null)
    const res = await app.inject('/api/v1/activity/export?days=30')
    expect(res.body).toContain('"\'=HYPERLINK(""unsafe""),\nnext"')
    expect(res.body).not.toContain('api_key')
    expect(res.body).not.toContain('response')
  })

  it.each(['0', '-1', '366', 'abc', '7days', '1.5'])('rejects invalid days=%s', async (days) => {
    expect((await app.inject(`/api/v1/activity/stats?days=${days}`)).statusCode).toBe(400)
    expect((await app.inject(`/api/v1/activity/export?days=${days}`)).statusCode).toBe(400)
  })
})
