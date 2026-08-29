/** Optional single-operator authentication. Tokens never enter URLs or browser storage. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppConfig } from './config.js'
import { AppError } from './lib/errors.js'

const COOKIE = 'oc_session'
const TTL = 12 * 60 * 60 * 1000
const digest = (s: string) => createHash('sha256').update(s).digest()
const cookieId = (req: FastifyRequest) =>
  req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)

export function registerOperatorAuth(app: FastifyInstance, config: AppConfig): void {
  const secret = config.operatorToken ? digest(config.operatorToken) : null
  const sessions = new Map<string, { expires: number; streams: Set<() => void> }>()
  const attempts = new Map<string, { count: number; reset: number }>()
  let globalAttempts = { count: 0, reset: 0 }
  const hosts = new Set(config.allowedHosts ?? ['localhost', '127.0.0.1', '[::1]'])
  const retire = (id: string) => {
    sessions.get(id)?.streams.forEach((close) => close())
    sessions.delete(id)
  }
  const authenticated = (req: FastifyRequest) => {
    if (!secret) return true
    const bearer = req.headers.authorization
    if (bearer?.startsWith('Bearer ') && timingSafeEqual(digest(bearer.slice(7)), secret)) return true
    const id = cookieId(req)
    const session = id ? sessions.get(id) : undefined
    if (session && session.expires > Date.now()) return true
    if (id) retire(id)
    return false
  }
  const cookie = (value: string, maxAge: number) =>
    `${COOKIE}=${value}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies ? '; Secure' : ''}`

  app.addHook('onRequest', async (req, reply) => {
    // Never trust forwarded Host. Reverse proxies must preserve the configured Host.
    const host = req.headers.host ?? ''
    let hostname = ''
    try {
      const url = new URL(`http://${host}`)
      if (url.host === host.toLowerCase() && !url.username && !url.password) hostname = url.hostname
      // URL normalizes the default port away.
      if (host.toLowerCase() === `${url.hostname}:80`) hostname = url.hostname
    } catch {
      /* invalid authority */
    }
    if (!hosts.has(hostname)) throw new AppError(403, 'host_denied', 'Host is not in OPEN_COUNCIL_ALLOWED_HOSTS')
    if (!req.url.startsWith('/api/')) return
    const pathname = req.url.split('?')[0]!.replace(/\/+$/, '')
    const publicPaths = ['/api/v1/auth/status', '/api/v1/auth/login', '/api/v1/health', '/api/v1/system/health']
    if (publicPaths.includes(pathname)) return
    if (!authenticated(req)) throw new AppError(401, 'authentication_required', 'Operator sign-in required')
    const id = cookieId(req)
    const session = id ? sessions.get(id) : undefined
    if (session && pathname.endsWith('/events')) {
      const close = () => reply.raw.destroy()
      const timer = setTimeout(close, Math.max(1, session.expires - Date.now()))
      timer.unref()
      session.streams.add(close)
      reply.raw.once('close', () => {
        clearTimeout(timer)
        session.streams.delete(close)
      })
    }
  })
  app.get('/api/v1/auth/status', async (req) => ({ enabled: !!secret, authenticated: authenticated(req) }))
  app.post('/api/v1/auth/login', async (req, reply) => {
    if (!secret) return { ok: true }
    const now = Date.now()
    for (const [ip, value] of attempts) if (value.reset <= now) attempts.delete(ip)
    if (globalAttempts.reset <= now) globalAttempts = { count: 0, reset: now + 60_000 }
    if (++globalAttempts.count > 60) {
      reply.header('Retry-After', '60')
      throw new AppError(429, 'rate_limited', 'Too many sign-in attempts. Try again in a minute.')
    }
    const bucket = attempts.get(req.ip) ?? { count: 0, reset: now + 60_000 }
    attempts.set(req.ip, bucket)
    if (++bucket.count > 5) {
      reply.header('Retry-After', '60')
      throw new AppError(429, 'rate_limited', 'Too many sign-in attempts. Try again in a minute.')
    }
    const { token } = z.object({ token: z.string().min(1).max(4096) }).parse(req.body)
    if (!timingSafeEqual(digest(token), secret)) throw new AppError(401, 'invalid_token', 'Invalid operator token')
    for (const [id, session] of sessions) if (session.expires <= now) retire(id)
    const previous = cookieId(req)
    if (previous) retire(previous)
    if (sessions.size >= 128) retire(sessions.keys().next().value!)
    const id = randomBytes(32).toString('hex')
    sessions.set(id, { expires: now + TTL, streams: new Set() })
    reply.header('Set-Cookie', cookie(id, TTL / 1000))
    return { ok: true }
  })
  app.post('/api/v1/auth/logout', async (req, reply) => {
    const id = cookieId(req)
    if (id) retire(id)
    reply.header('Set-Cookie', cookie('', 0))
    return { ok: true }
  })
  app.addHook('onClose', async () => {
    for (const id of sessions.keys()) retire(id)
  })
}
