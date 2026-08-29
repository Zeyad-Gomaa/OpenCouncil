import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadEnvFile } from '../env.js'
import { loadConfig } from '../config.js'

const KEYS = ['OPEN_COUNCIL_SECRET_KEY', 'OPEN_COUNCIL_ENV_FILE', 'PORT', 'HOST'] as const

afterEach(() => {
  for (const key of KEYS) delete process.env[key]
})

function envDir(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'oc-env-'))
  writeFileSync(path.join(dir, '.env'), contents)
  return dir
}

describe('.env loading', () => {
  it('reads the vault key out of .env so provider keys survive a restart', () => {
    const dir = envDir('OPEN_COUNCIL_SECRET_KEY=super-secret-master-key\nPORT=5000\n')
    expect(loadEnvFile(dir)).toBe(path.join(dir, '.env'))
    expect(process.env.OPEN_COUNCIL_SECRET_KEY).toBe('super-secret-master-key')
    expect(process.env.PORT).toBe('5000')
  })

  it('lets a real environment variable win over the file', () => {
    process.env.OPEN_COUNCIL_SECRET_KEY = 'from-environment'
    loadEnvFile(envDir('OPEN_COUNCIL_SECRET_KEY=from-file\n'))
    expect(process.env.OPEN_COUNCIL_SECRET_KEY).toBe('from-environment')
  })

  it('treats a missing default .env as normal but a missing explicit one as an error', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'oc-env-'))
    expect(loadEnvFile(empty)).toBeNull()
    process.env.OPEN_COUNCIL_ENV_FILE = 'nope.env'
    expect(() => loadEnvFile(empty)).toThrow(/could not read env file/)
  })
})

describe('runtime config', () => {
  it('reuses a generated durable vault key and parses the research policy', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oc-config-'))
    const env = { DATABASE_PATH: path.join(dir, 'test.db'), WEB_RESEARCH_ENABLED: 'false', OPEN_COUNCIL_SECRET_KEY: '' }
    const first = loadConfig(env)
    const second = loadConfig(env)
    expect(first.hasDurableSecret).toBe(true)
    expect(second.secretKey).toBe(first.secretKey)
    expect(statSync(path.join(dir, '.secret_key')).mode & 0o777).toBe(0o600)
    expect(first.researchEnabled).toBe(false)
    expect(loadConfig({ ...env, WEB_RESEARCH_ENABLED: '1' }).researchEnabled).toBe(true)
    expect(() => loadConfig({ ...env, WEB_RESEARCH_ENABLED: 'nope' })).toThrow()
  })
})
