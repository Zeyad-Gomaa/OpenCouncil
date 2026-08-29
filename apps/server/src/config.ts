/** Environment configuration — parsed once, validated with zod. */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4311),
  DATABASE_PATH: z.string().default('./data/opencouncil.db'),
  OPEN_COUNCIL_SECRET_KEY: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(8).optional()),
  OPEN_COUNCIL_OPERATOR_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).max(4096).optional()),
  OPEN_COUNCIL_ALLOWED_HOSTS: z.string().optional(),
  OPEN_COUNCIL_SECURE_COOKIES: z.enum(['true', 'false']).default('false'),
  OPEN_COUNCIL_MAX_SESSION_USD: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().positive().finite().optional(),
  ),
  SEED_DEMO_COUNCIL: z
    .string()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WEB_RESEARCH_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
})

export type AppConfig = {
  operatorToken?: string
  allowedHosts?: string[]
  secureCookies?: boolean
  maxSessionUsd?: number
  host: string
  port: number
  databasePath: string
  dataDir: string
  /** True when a durable master key was provided via env or persisted key file (keys survive restart). */
  hasDurableSecret: boolean
  secretKey: string
  seedDemoCouncil: boolean
  researchEnabled: boolean
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  // Resolve DB path relative to the server package dir for predictable dev behavior.
  const isAbsolute = parsed.DATABASE_PATH.startsWith('/')
  let databasePath = parsed.DATABASE_PATH
  if (!isAbsolute && !parsed.DATABASE_PATH.includes(process.cwd())) {
    databasePath = path.join(process.cwd(), parsed.DATABASE_PATH)
  }

  const dataDir = path.dirname(databasePath)
  mkdirSync(dataDir, { recursive: true })

  let secretKey = parsed.OPEN_COUNCIL_SECRET_KEY
  let hasDurableSecret = true

  if (!secretKey) {
    const keyFile = path.join(dataDir, '.secret_key')
    if (existsSync(keyFile)) {
      try {
        const stored = readFileSync(keyFile, 'utf8').trim()
        if (stored && stored.length >= 8) {
          secretKey = stored
        }
      } catch {
        // ignore and generate
      }
    }
    if (!secretKey) {
      secretKey = randomBytes(32).toString('hex')
      try {
        writeFileSync(keyFile, secretKey, { mode: 0o600 })
      } catch {
        hasDurableSecret = false
      }
    }
  }

  return {
    operatorToken: parsed.OPEN_COUNCIL_OPERATOR_TOKEN,
    allowedHosts: parsed.OPEN_COUNCIL_ALLOWED_HOSTS?.split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? [
      'localhost',
      '127.0.0.1',
      '[::1]',
      ...(!['0.0.0.0', '::'].includes(parsed.HOST) ? [parsed.HOST.toLowerCase()] : []),
    ],
    secureCookies: parsed.OPEN_COUNCIL_SECURE_COOKIES === 'true',
    maxSessionUsd: parsed.OPEN_COUNCIL_MAX_SESSION_USD,
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath,
    dataDir,
    hasDurableSecret,
    secretKey,
    seedDemoCouncil: parsed.SEED_DEMO_COUNCIL,
    researchEnabled: parsed.WEB_RESEARCH_ENABLED,
    logLevel: parsed.LOG_LEVEL,
  }
}
