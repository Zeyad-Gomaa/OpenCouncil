/** End-to-end: full mock council deliberation through the engine + REST API. */
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { setVaultKeyForTests } from '../vault/crypto.js'
import { loadConfig } from '../config.js'
import { migrate, openDatabase, type DB } from '../db/connection.js'
import { seedDemoCouncil } from '../db/seed.js'
import { SessionBus } from '../engine/bus.js'
import { SessionRunner } from '../engine/runner.js'
import { SessionManager } from '../engine/session-manager.js'
import { makeRunnerDbHelpers, buildApp } from '../app.js'

let db: DB
let bus: SessionBus
let sessions: SessionManager
let app: Awaited<ReturnType<typeof buildApp>>
const seenEvents: { type: string; sessionId?: string }[] = []

beforeAll(async () => {
  setVaultKeyForTests('test-secret-e2e')
  const config = {
    ...loadConfig({} as never),
    databasePath: ':memory:',
    dataDir: '.',
    logLevel: 'error' as const,
    host: '127.0.0.1',
    port: 0,
  } as never as ReturnType<typeof loadConfig>
  db = openDatabase(config)
  migrate(db)
  seedDemoCouncil(db)

  bus = new SessionBus()
  bus.subscribe('*', (e) => seenEvents.push(e as never))
  // Subscribe to every session by wrapping publish
  const origPublish = bus.publish.bind(bus)
  bus.publish = (e) => {
    seenEvents.push(e)
    origPublish(e)
  }

  const helpers = makeRunnerDbHelpers(db)
  const runner = new SessionRunner({
    bus,
    recordUsage: helpers.recordUsage,
    insertMessage: helpers.insertMessage,
    loadCouncil: helpers.loadCouncil,
    loadModelForChat: helpers.loadModelForChat,
    updateSessionStatus: helpers.updateSessionStatus,
  })
  sessions = new SessionManager(bus, runner)
  app = await buildApp({ config, db, bus, sessions })
})

afterEach(() => {
  seenEvents.length = 0
})

async function waitForSessionCompletion(sessionId: string, timeoutMs = 10_000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId) as { status: string }
    if (row && row.status !== 'queued' && row.status !== 'running') return row.status
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('timeout waiting for session completion')
}

describe('council end-to-end', () => {
  it('health endpoint responds', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
  })

  it('runs a full debate session through the mock council', async () => {
    const council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { councilId: council.id, topic: 'What is the best strategy for council deliberation?' },
    })
    expect(create.statusCode).toBe(202)
    const sessionId = create.json().id

    const status = await waitForSessionCompletion(sessionId)
    expect(status).toBe('completed')

    // Snapshot contains user msg + 2 rounds x 3 members + synthesis = 8 messages
    const snap = await app.inject({ method: 'GET', url: `/api/v1/sessions/${sessionId}` })
    const body = snap.json()
    expect(body.messages).toHaveLength(8)
    expect(body.messages[0].kind).toBe('user')
    const kinds = body.messages.map((m: { kind: string }) => m.kind)
    expect(kinds.filter((k: string) => k === 'discussion')).toHaveLength(6)
    expect(kinds.filter((k: string) => k === 'synthesis')).toHaveLength(1)

    // Usage events recorded per successful call (7 LLM calls)
    const usageCount = (
      db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE session_id = ? AND status='ok'").get(sessionId) as {
        n: number
      }
    ).n
    expect(usageCount).toBe(7)

    // Events fired in order-ish: started → rounds → synthesis → completed
    const types = seenEvents.filter((e) => e.sessionId === sessionId).map((e) => e.type)
    expect(types[0]).toBe('session.started')
    expect(types).toContain('round.started')
    expect(types).toContain('moderator.started')
    expect(types).toContain('synthesis.completed')
    expect(types[types.length - 1]).toBe('session.completed')
  })

  it('activity stats reflect the session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/activity/stats?days=30' })
    const body = res.json()
    expect(res.statusCode).toBe(200)
    expect(body.totals.sessions).toBeGreaterThanOrEqual(1)
    expect(body.totals.totalTokens).toBeGreaterThan(0)
    expect(body.byMember.length).toBeGreaterThan(0)
  })

  it('rejects invalid payloads with error envelope', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/sessions', payload: { councilId: 'nope' } })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    const body = res.json()
    expect(body.error).toBeDefined()
    expect(body.error.message).toBeTruthy()
  })

  it('provider CRUD keeps keys encrypted and hidden', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      payload: { name: 'OpenAI Test', protocol: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-litmus-123' },
    })
    expect(created.statusCode).toBe(201)
    const dto = created.json()
    expect(dto.hasApiKey).toBe(true)
    expect(JSON.stringify(dto)).not.toContain('sk-litmus-123')

    const stored = db.prepare('SELECT api_key_encrypted FROM providers WHERE id = ?').get(dto.id) as {
      api_key_encrypted: string
    }
    expect(stored.api_key_encrypted).not.toContain('sk-litmus-123')

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/providers/${dto.id}` })
    expect(del.statusCode).toBe(200)
  })
})
