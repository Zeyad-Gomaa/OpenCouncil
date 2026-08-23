import { beforeEach, describe, expect, it } from 'vitest'
import { migrate, openDatabase } from '../db/connection.js'
import { seedDemoCouncil } from '../db/seed.js'
import type { DB } from '../db/connection.js'

let db: DB

beforeEach(() => {
  db = openDatabase({ databasePath: ':memory:' } as never)
  migrate(db)
})

describe('migrations', () => {
  it('creates all core tables', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (r) => r.name,
    )
    for (const t of [
      'providers',
      'models',
      'members',
      'councils',
      'council_members',
      'sessions',
      'messages',
      'usage_events',
      'activity_log',
      'settings_kv',
      'schema_migrations',
    ]) {
      expect(tables).toContain(t)
    }
  })

  it('is idempotent', () => {
    expect(() => migrate(db)).not.toThrow()
  })
})

describe('seedDemoCouncil', () => {
  it('seeds provider, models, members, and a council on empty db', () => {
    expect(seedDemoCouncil(db)).toBe(true)
    const counts = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM providers) p, (SELECT COUNT(*) FROM models) m,
         (SELECT COUNT(*) FROM members) mem, (SELECT COUNT(*) FROM councils) c`,
      )
      .get() as { p: number; m: number; mem: number; c: number }
    expect(counts).toEqual({ p: 1, m: 3, mem: 3, c: 1 })
  })

  it('does not re-seed when councils exist', () => {
    seedDemoCouncil(db)
    expect(seedDemoCouncil(db)).toBe(false)
  })

  it('council has moderator and three members', () => {
    seedDemoCouncil(db)
    const c = db.prepare('SELECT * FROM councils').get() as { moderator_member_id: string | null }
    expect(c.moderator_member_id).toBeTruthy()
    const cm = db.prepare('SELECT COUNT(*) AS n FROM council_members').get() as { n: number }
    expect(cm.n).toBe(3)
  })
})
