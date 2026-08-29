import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerOperatorAuth } from '../auth.js'
import { registerErrorHandlers } from '../lib/errors.js'
import type { AppConfig } from '../config.js'

const TOKEN = 'test-operator-token-at-least-32-chars'
async function makeApp(overrides: Partial<AppConfig> = {}) {
  const app = Fastify()
  registerErrorHandlers(app)
  registerOperatorAuth(app, {
    operatorToken: TOKEN,
    allowedHosts: ['localhost'],
    secureCookies: false,
    logLevel: 'fatal',
    ...overrides,
  } as AppConfig)
  app.get('/api/v1/private', async () => ({ ok: true }))
  return app
}

describe('operator authentication', () => {
  const apps: Awaited<ReturnType<typeof makeApp>>[] = []
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })
  it('uses a HttpOnly strict cookie for API, SSE-compatible requests and logout', async () => {
    const app = await makeApp()
    apps.push(app)
    expect((await app.inject({ url: '/api/v1/private' })).statusCode).toBe(401)
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { token: TOKEN } })
    expect(login.statusCode).toBe(200)
    expect(login.headers['set-cookie']).toContain('HttpOnly')
    expect(login.headers['set-cookie']).toContain('SameSite=Strict')
    const cookie = login.headers['set-cookie']!.split(';')[0]!
    expect((await app.inject({ url: '/api/v1/private', headers: { cookie } })).statusCode).toBe(200)
    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } })
    expect(logout.headers['set-cookie']).toContain('Max-Age=0')
    expect((await app.inject({ url: '/api/v1/private', headers: { cookie } })).statusCode).toBe(401)
  })
  it('accepts bearer auth for headless clients and rejects unconfigured hosts', async () => {
    const app = await makeApp()
    apps.push(app)
    expect(
      (await app.inject({ url: '/api/v1/private', headers: { authorization: `Bearer ${TOKEN}` } })).statusCode,
    ).toBe(200)
    expect((await app.inject({ url: '/api/v1/health', headers: { host: 'evil.example' } })).statusCode).toBe(403)
  })
  it('rate limits repeated failed logins per client', async () => {
    const app = await makeApp()
    apps.push(app)
    for (let i = 0; i < 5; i++)
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { token: 'wrong' } })).statusCode,
      ).toBe(401)
    const limited = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { token: 'wrong' } })
    expect(limited.statusCode).toBe(429)
    expect(limited.headers['retry-after']).toBe('60')
  })
})
