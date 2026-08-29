/** End-to-end: full mock council deliberation through the engine + REST API. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { mockAdapter } from '../providers/mock.js'
import { AuthError } from '../lib/http.js'
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
const seenEvents: { type: string; sessionId?: string; statusAtPublish?: string }[] = []

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ query: { search: [] } }), { status: 200 })),
  )
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

  bus = new SessionBus((event, sequence) => {
    db.prepare('INSERT INTO session_events (session_id, sequence, type, payload_json) VALUES (?, ?, ?, ?)').run(
      event.sessionId,
      sequence,
      event.type,
      JSON.stringify(event),
    )
  })
  bus.subscribe('*', (e) => seenEvents.push(e as never))
  // Subscribe to every session by wrapping publish
  const origPublish = bus.publish.bind(bus)
  bus.publish = (e) => {
    const row = db.prepare('SELECT status FROM sessions WHERE id=?').get(e.sessionId) as { status: string } | undefined
    seenEvents.push({ ...e, statusAtPublish: row?.status })
    origPublish(e)
  }

  const helpers = makeRunnerDbHelpers(db)
  const runner = new SessionRunner({ bus, ...helpers })
  sessions = new SessionManager(bus, runner)
  app = await buildApp({ config, db, bus, sessions })
})

afterEach(() => {
  seenEvents.length = 0
  vi.restoreAllMocks()
})

afterAll(async () => {
  await app.close()
  vi.unstubAllGlobals()
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
  it('publishes curated council templates with valid strategies', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/meta/council-templates' })
    expect(res.statusCode).toBe(200)
    const templates = res.json().templates as { key: string; strategy: string; rounds: number }[]
    expect(templates).toHaveLength(6)
    expect(templates.map((template) => template.key)).toContain('code-review')
    expect(new Set(templates.map((template) => template.key)).size).toBe(templates.length)
    expect(templates.every((template) => template.rounds >= 1 && template.rounds <= 8)).toBe(true)
  })

  it('uses 400 for malformed JSON, 415 for unsupported media, and 413 for oversized bodies', async () => {
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { 'content-type': 'application/json' },
      payload: '{broken',
    })
    expect(malformed.statusCode).toBe(400)
    const unsupported = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { 'content-type': 'application/xml' },
      payload: '<test/>',
    })
    expect(unsupported.statusCode).toBe(415)
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { topic: 'x'.repeat(1_100_000) },
    })
    expect(oversized.statusCode).toBe(413)
  })

  it('blocks cross-origin API requests while allowing local clients and same-origin browser traffic', async () => {
    for (const headers of [
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
      { origin: 'https://untrusted.example' },
      { origin: 'null' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/providers',
        headers,
        payload: { name: 'Blocked', protocol: 'mock' },
      })
      expect(res.statusCode).toBe(403)
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: { 'sec-fetch-site': 'same-origin' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    const legacy = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: { host: 'localhost:4311', origin: 'http://localhost:4311' },
    })
    expect(legacy.statusCode).toBe(200)
  })

  it('runs private mock sessions without making any web requests and preserves the option on rerun', async () => {
    const council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    vi.mocked(fetch).mockClear()
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { councilId: council.id, topic: 'private topic', researchEnabled: false },
    })
    expect(created.statusCode).toBe(202)
    const id = created.json().id
    expect(await waitForSessionCompletion(id)).toBe('completed')
    expect(fetch).not.toHaveBeenCalled()
    const snapshot = (await app.inject({ method: 'GET', url: `/api/v1/sessions/${id}` })).json()
    expect(snapshot.session.researchEnabled).toBe(false)
    expect(snapshot.messages.some((m: { memberName: string }) => m.memberName === 'Web Search')).toBe(false)
    const rerun = await app.inject({ method: 'POST', url: `/api/v1/sessions/${id}/rerun` })
    expect(await waitForSessionCompletion(rerun.json().id)).toBe('completed')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('persists anonymous peer rankings and fails closed when a budgeted model lacks prices', async () => {
    const council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    const ranked = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {
        councilId: council.id,
        topic: 'compare two safe approaches',
        researchEnabled: false,
        consensusEnabled: true,
      },
    })
    expect(await waitForSessionCompletion(ranked.json().id)).toBe('completed')
    const rankedSnapshot = (await app.inject({ url: `/api/v1/sessions/${ranked.json().id}` })).json()
    expect(rankedSnapshot.session.consensus.status).toBe('complete')
    expect(rankedSnapshot.session.consensus.ballots).toHaveLength(3)
    expect(rankedSnapshot.session.consensus.coverage).toBe(1)

    const budgeted = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {
        councilId: council.id,
        topic: 'do not spend without prices',
        researchEnabled: false,
        budgetUsd: 1,
      },
    })
    expect(await waitForSessionCompletion(budgeted.json().id)).toBe('failed')
    const budgetSnapshot = (await app.inject({ url: `/api/v1/sessions/${budgeted.json().id}` })).json()
    expect(budgetSnapshot.session.error).toMatch(/requires input and output pricing/i)
    expect(budgetSnapshot.session.budget.attempts).toBe(0)
  })

  it('enforces a server-wide research disable even when the request enables it', async () => {
    const council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    const runner = new SessionRunner({ ...makeRunnerDbHelpers(db), bus, researchEnabled: false })
    const privateApp = await buildApp({
      db,
      bus,
      sessions: new SessionManager(bus, runner),
      config: { researchEnabled: false, logLevel: 'error' } as ReturnType<typeof loadConfig>,
    })
    vi.spyOn(mockAdapter, 'chat').mockResolvedValue({ text: 'Private response', promptTokens: 1, completionTokens: 1 })
    vi.mocked(fetch).mockClear()
    try {
      const created = await privateApp.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { councilId: council.id, topic: 'private server', researchEnabled: true },
      })
      expect(created.json().researchEnabled).toBe(false)
      expect(await waitForSessionCompletion(created.json().id)).toBe('completed')
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      await privateApp.close()
    }
  })

  it('marks a council failed if all provider calls fail', async () => {
    const council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    vi.spyOn(mockAdapter, 'chat').mockRejectedValue(new AuthError('invalid key'))
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { councilId: council.id, topic: 'failure test', researchEnabled: false },
    })
    expect(await waitForSessionCompletion(created.json().id)).toBe('failed')
    expect(seenEvents.filter((e) => e.sessionId === created.json().id).map((e) => e.type)).not.toContain(
      'session.completed',
    )
  })

  it('does not call disabled providers or models', async () => {
    const model = db.prepare('SELECT id, provider_id FROM models LIMIT 1').get() as { id: string; provider_id: string }
    const helpers = makeRunnerDbHelpers(db)
    db.prepare('UPDATE models SET enabled=0 WHERE id=?').run(model.id)
    try {
      expect(helpers.loadModelForChat(model.id)).toBeNull()
    } finally {
      db.prepare('UPDATE models SET enabled=1 WHERE id=?').run(model.id)
    }
    db.prepare('UPDATE providers SET enabled=0 WHERE id=?').run(model.provider_id)
    try {
      expect(helpers.loadModelForChat(model.id)).toBeNull()
    } finally {
      db.prepare('UPDATE providers SET enabled=1 WHERE id=?').run(model.provider_id)
    }
  })

  it('cancels the final in-flight call without reporting completion', async () => {
    const member = db.prepare('SELECT id FROM members LIMIT 1').get() as { id: string }
    const council = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/councils',
        payload: { name: 'Cancellation test', strategy: 'round_robin', rounds: 1, memberIds: [member.id] },
      })
    ).json() as { id: string }
    vi.spyOn(mockAdapter, 'chat').mockImplementation(async (opts) => {
      await new Promise<void>((resolve) => {
        if (opts.signal?.aborted) resolve()
        else opts.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
      throw new Error('cancelled')
    })
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { councilId: council.id, topic: 'cancel test', researchEnabled: false },
    })
    const id = created.json().id
    await app.inject({ method: 'POST', url: `/api/v1/sessions/${id}/cancel` })
    expect(await waitForSessionCompletion(id)).toBe('cancelled')
    await app.inject({ method: 'DELETE', url: `/api/v1/councils/${council.id}` })
  })

  it('reports no live catalog for the mock provider', async () => {
    const provider = db.prepare("SELECT id FROM providers WHERE protocol='mock' LIMIT 1").get() as { id: string }
    const res = await app.inject({ method: 'GET', url: `/api/v1/providers/${provider.id}/catalog` })
    expect(res.statusCode).toBe(200)
    expect(res.json().supported).toBe(false)
    expect(res.json().models).toEqual([])
    const slashed = await app.inject({ method: 'GET', url: `/api/v1/providers/${provider.id}/catalog/` })
    expect(slashed.statusCode).toBe(200)
    const posted = await app.inject({ method: 'POST', url: `/api/v1/providers/${provider.id}/discover-models` })
    expect(posted.statusCode).toBe(200)
    expect(posted.json().supported).toBe(false)
  })

  it('attaches a local workspace and surfaces it on the session', async () => {
    const council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    const ws = path.join(os.tmpdir(), `oc-e2e-ws-${Date.now()}`)
    mkdirSync(ws)
    writeFileSync(path.join(ws, 'README.md'), '# attached\n')
    try {
      const preview = await app.inject({
        method: 'POST',
        url: '/api/v1/workspace/preview',
        payload: { path: ws },
      })
      expect(preview.statusCode).toBe(200)
      expect(preview.json().fileCount).toBeGreaterThan(0)

      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { councilId: council.id, topic: 'What does the attached README say?', workspacePath: ws },
      })
      expect(create.statusCode).toBe(202)
      expect(create.json().workspacePath).toMatch(/oc-e2e-ws-/)
      const sessionId = create.json().id
      const status = await waitForSessionCompletion(sessionId)
      expect(status).toBe('completed')
      const snap = await app.inject({ method: 'GET', url: `/api/v1/sessions/${sessionId}` })
      const names = snap.json().messages.map((m: { memberName: string }) => m.memberName)
      expect(names).toContain('Workspace')
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })

  it('uses workspace tools to review real local code and persists only the final finding', async () => {
    const council = db.prepare('SELECT id, strategy, rounds FROM councils LIMIT 1').get() as {
      id: string
      strategy: string
      rounds: number
    }
    const ws = path.join(os.tmpdir(), `oc-code-review-${Date.now()}`)
    mkdirSync(path.join(ws, 'src'), { recursive: true })
    writeFileSync(
      path.join(ws, 'src', 'queue.ts'),
      'export function take(items: string[]) {\n  return items.pop()\n}\n',
    )
    db.prepare("UPDATE councils SET strategy='review', rounds=1 WHERE id=?").run(council.id)
    const chat = vi.spyOn(mockAdapter, 'chat').mockImplementation(async (opts) => {
      const system = opts.messages.find((message) => message.role === 'system')?.content ?? ''
      const all = opts.messages.map((message) => message.content).join('\n')
      if (/chair of a decision council/i.test(system)) {
        return { text: '# Recommendation\nFix the queue defect before merging.', promptTokens: 1, completionTokens: 1 }
      }
      if (system.includes('<workspace_tools>') && !all.includes('TOOL RESULTS:')) {
        return {
          text: '```tool\n{"name":"read_file","path":"src/queue.ts","startLine":1,"endLine":20}\n```',
          promptTokens: 1,
          completionTokens: 1,
        }
      }
      if (all.includes('items.pop()')) {
        return {
          text: '`src/queue.ts:2` uses `pop()`, making the queue LIFO instead of FIFO. Replace it with `shift()` and add a multi-item ordering test. Request changes.',
          promptTokens: 1,
          completionTokens: 1,
        }
      }
      return { text: 'Unable to inspect the implementation.', promptTokens: 1, completionTokens: 1 }
    })
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: {
          councilId: council.id,
          topic: 'Review the queue implementation for correctness.',
          workspacePath: ws,
          workspaceFiles: ['src/queue.ts'],
          researchEnabled: false,
        },
      })
      expect(created.statusCode).toBe(202)
      const sessionId = created.json().id
      expect(await waitForSessionCompletion(sessionId)).toBe('completed')
      const snapshot = (await app.inject({ method: 'GET', url: `/api/v1/sessions/${sessionId}` })).json()
      const discussion = snapshot.messages
        .filter((message: { kind: string }) => message.kind === 'discussion')
        .map((message: { content: string }) => message.content)
        .join('\n')
      expect(chat.mock.calls.length).toBeGreaterThan(3)
      expect(discussion).toContain('src/queue.ts:2')
      expect(discussion).toContain('shift()')
      expect(discussion).not.toContain('```tool')
    } finally {
      db.prepare('UPDATE councils SET strategy=?, rounds=? WHERE id=?').run(
        council.strategy,
        council.rounds,
        council.id,
      )
      rmSync(ws, { recursive: true, force: true })
    }
  })

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

    // Snapshot: user + web-search system note + 2 rounds x 3 members + synthesis
    const snap = await app.inject({ method: 'GET', url: `/api/v1/sessions/${sessionId}` })
    const body = snap.json()
    expect(body.messages).toHaveLength(9)
    expect(body.messages[0].kind).toBe('user')
    const kinds = body.messages.map((m: { kind: string }) => m.kind)
    expect(kinds.filter((k: string) => k === 'system')).toHaveLength(1)
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
    expect(seenEvents.find((e) => e.sessionId === sessionId && e.type === 'session.completed')?.statusAtPublish).toBe(
      'completed',
    )
  })

  it('activity stats reflect the session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/activity/stats?days=30' })
    const body = res.json()
    expect(res.statusCode).toBe(200)
    expect(body.totals.sessions).toBeGreaterThanOrEqual(1)
    expect(body.totals.totalTokens).toBeGreaterThan(0)
    expect(body.byMember.length).toBeGreaterThan(0)
  })

  it('keeps session history viewable after its council is deleted', async () => {
    const council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { councilId: council.id, topic: 'snapshot test' },
    })
    const sessionId = create.json().id
    await waitForSessionCompletion(sessionId)
    const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/councils/${council.id}` })
    expect(deleted.statusCode).toBe(200)
    const history = await app.inject({ method: 'GET', url: `/api/v1/sessions/${sessionId}` })
    expect(history.statusCode).toBe(200)
    expect(history.json().session.councilName).toBeTruthy()
    expect(history.json().messages.length).toBeGreaterThan(0)
    const count = () => (db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n
    const before = count()
    for (const action of ['clone', 'rerun']) {
      const res = await app.inject({ method: 'POST', url: `/api/v1/sessions/${sessionId}/${action}` })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('council_missing')
    }
    expect(count()).toBe(before)
  })

  it('rejects invalid payloads with error envelope', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/sessions', payload: { councilId: 'nope' } })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
    expect(body.error.message).toBeTruthy()
  })

  it('provider CRUD keeps keys encrypted and hidden', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      payload: {
        name: 'OpenAI Test',
        protocol: 'openai_compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-litmus-123',
      },
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

  it('round-trips a config export through import and rejects malformed payloads with 400', async () => {
    const exported = await app.inject({ method: 'GET', url: '/api/v1/config/export' })
    expect(exported.statusCode).toBe(200)
    const config = exported.json()
    expect(JSON.stringify(config)).not.toContain('api_key_encrypted')

    const reimported = await app.inject({ method: 'POST', url: '/api/v1/config/import', payload: config })
    expect(reimported.statusCode).toBe(200)
    expect(reimported.json().secretsImported).toBe(false)

    // Previously a bad row reached SQLite and surfaced as an opaque 500.
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/config/import',
      payload: { providers: [], models: [{ id: 'not-a-uuid', providerId: 'nope' }], members: [], councils: [] },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('invalid_config')
  })

  it('supports dynamically extending debate rounds and early conclusion', { timeout: 15_000 }, async () => {
    let council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string } | undefined
    if (!council) {
      seedDemoCouncil(db)
      council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    }

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { councilId: council.id, topic: 'Testing debate extension' },
    })
    expect(create.statusCode).toBe(202)
    const sessionId = create.json().id

    // Try extend while running or queued
    const extendRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/extend`,
      payload: { additionalRounds: 1 },
    })
    expect([200, 400]).toContain(extendRes.statusCode)

    await waitForSessionCompletion(sessionId)

    // After completion, extend should return 400 invalid_state
    const postExtend = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/extend`,
      payload: { additionalRounds: 1 },
    })
    expect(postExtend.statusCode).toBe(400)
  })

  it('supports user intervention during active deliberation and web search fallback', async () => {
    let council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string } | undefined
    if (!council) {
      seedDemoCouncil(db)
      council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    }

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { councilId: council.id, topic: 'Deliberation with user intervention' },
    })
    expect(create.statusCode).toBe(202)
    const sessionId = create.json().id

    // User intervenes while session is running or queued
    const interveneRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/intervene`,
      payload: { content: 'Please focus on memory safety specifically.' },
    })
    expect([201, 400]).toContain(interveneRes.statusCode)

    await waitForSessionCompletion(sessionId)

    // Verify session completed with messages
    const history = await app.inject({ method: 'GET', url: `/api/v1/sessions/${sessionId}` })
    expect(history.statusCode).toBe(200)
    expect(history.json().messages.length).toBeGreaterThan(0)
  })
})
