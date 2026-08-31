import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setVaultKeyForTests } from '../vault/crypto.js'
import { loadConfig } from '../config.js'
import { migrate, openDatabase, type DB } from '../db/connection.js'
import { seedDemoCouncil } from '../db/seed.js'
import { SessionBus } from '../engine/bus.js'
import { SessionRunner } from '../engine/runner.js'
import { SessionManager } from '../engine/session-manager.js'
import { makeRunnerDbHelpers, buildApp } from '../app.js'
import { isApiUrl, registerWebUi, resolvePublicFile } from '../web-ui.js'

describe('web UI path safety', () => {
  it('treats /api as API even with a query string', () => {
    expect(isApiUrl('/api/v1/providers/x/catalog')).toBe(true)
    expect(isApiUrl('/api/v1/providers/x/catalog?foo=1')).toBe(true)
    expect(isApiUrl('/settings/')).toBe(false)
    expect(isApiUrl('/api')).toBe(true)
  })

  it('refuses path traversal', () => {
    const root = os.tmpdir()
    expect(resolvePublicFile(root, '/../../etc/passwd')).toBeNull()
    expect(resolvePublicFile(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull()
    const inside = resolvePublicFile(root, '/index.html')
    expect(inside).toBe(path.resolve(root, 'index.html'))
  })
})

describe('static UI does not swallow catalog routes', () => {
  let db: DB
  let app: Awaited<ReturnType<typeof buildApp>>
  let dir: string
  let outside: string

  beforeAll(async () => {
    setVaultKeyForTests('test-secret-webui')
    dir = path.join(os.tmpdir(), `oc-ui-${Date.now()}`)
    mkdirSync(path.join(dir, 'settings'), { recursive: true })
    mkdirSync(path.join(dir, '_next', 'static'), { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), '<html>home</html>')
    writeFileSync(path.join(dir, 'settings', 'index.html'), '<html>settings</html>')
    writeFileSync(path.join(dir, '_next', 'static', 'app.js'), 'console.log("ready")')
    writeFileSync(path.join(dir, 'secret.txt'), 'nope')
    outside = path.join(os.tmpdir(), `oc-ui-outside-${Date.now()}.txt`)
    writeFileSync(outside, 'outside export')
    symlinkSync(outside, path.join(dir, 'escape.txt'))

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
    const bus = new SessionBus()
    const helpers = makeRunnerDbHelpers(db)
    const runner = new SessionRunner({
      bus,
      recordUsage: helpers.recordUsage,
      insertMessage: helpers.insertMessage,
      loadCouncil: helpers.loadCouncil,
      loadModelForChat: helpers.loadModelForChat,
      updateSessionStatus: helpers.updateSessionStatus,
      loadWorkspace: helpers.loadWorkspace,
    })
    const sessions = new SessionManager(bus, runner)
    app = await buildApp({ config, db, bus, sessions })
    const mounted = await registerWebUi(app, dir)
    expect(mounted).toBe(true)
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(outside, { force: true })
  })

  it('serves GET and POST catalog after the UI is mounted', async () => {
    const provider = db.prepare("SELECT id FROM providers WHERE protocol='mock' LIMIT 1").get() as { id: string }
    const get = await app.inject({ method: 'GET', url: `/api/v1/providers/${provider.id}/catalog` })
    expect(get.statusCode).toBe(200)
    expect(get.json().supported).toBe(false)
    const slashed = await app.inject({ method: 'GET', url: `/api/v1/providers/${provider.id}/catalog/` })
    expect(slashed.statusCode).toBe(200)
    const posted = await app.inject({ method: 'POST', url: `/api/v1/providers/${provider.id}/discover-models` })
    expect(posted.statusCode).toBe(200)
    expect(posted.headers['content-type']).toMatch(/json/)
  })

  it('JSON-404s unknown API routes instead of returning the SPA', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/providers/nope/catalog' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('not_found')
    const missing = await app.inject({ method: 'POST', url: '/api/v1/does-not-exist' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.message).toMatch(/no such API route/)
  })

  it('still serves the chamber HTML', async () => {
    const home = await app.inject({ method: 'GET', url: '/' })
    expect(home.statusCode).toBe(200)
    expect(home.body).toContain('home')
    expect(home.headers['content-type']).toMatch(/^text\/html/)
    expect(home.headers['cache-control']).toBe('no-cache')
    expect(home.headers.etag).toMatch(/^W\//)
    const settings = await app.inject({ method: 'GET', url: '/settings/' })
    expect(settings.statusCode).toBe(200)
    expect(settings.body).toContain('settings')
  })

  it('serves hashed assets with MIME metadata and immutable caching', async () => {
    const asset = await app.inject({ method: 'GET', url: '/_next/static/app.js' })
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['content-type']).toMatch(/^text\/javascript/)
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(asset.body).toContain('ready')

    const cached = await app.inject({
      method: 'GET',
      url: '/_next/static/app.js',
      headers: { 'if-none-match': asset.headers.etag! },
    })
    expect(cached.statusCode).toBe(304)
    expect(cached.body).toBe('')
  })

  it('does not follow static-file symlinks outside the export', async () => {
    const escaped = await app.inject({ method: 'GET', url: '/escape.txt' })
    expect(escaped.body).not.toContain('outside export')
    expect(escaped.body).toContain('home')
  })
})
