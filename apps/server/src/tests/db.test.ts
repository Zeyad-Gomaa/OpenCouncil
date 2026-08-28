import { beforeEach, describe, expect, it } from 'vitest'
import { migrate, openDatabase, recoverInterruptedSessions } from '../db/connection.js'
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

  it('adds workspace columns on sessions', () => {
    const cols = (db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('workspace_path')
    expect(cols).toContain('workspace_files_json')
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

describe('repairable model references', () => {
  it('allows a model to be deleted while preserving and disabling its member', () => {
    seedDemoCouncil(db)
    const model = db.prepare('SELECT id FROM models LIMIT 1').get() as { id: string }
    const member = db.prepare('SELECT id FROM members WHERE model_id = ?').get(model.id) as { id: string }
    db.exec('BEGIN')
    db.prepare('UPDATE members SET enabled = 0 WHERE model_id = ?').run(model.id)
    db.prepare('DELETE FROM models WHERE id = ?').run(model.id)
    db.exec('COMMIT')
    expect(db.prepare('SELECT model_id, enabled FROM members WHERE id = ?').get(member.id)).toEqual({
      model_id: null,
      enabled: 0,
    })
  })
})

describe('restart recovery', () => {
  it('marks queued and running sessions failed with a clear reason', () => {
    seedDemoCouncil(db)
    const council = db.prepare('SELECT id FROM councils LIMIT 1').get() as { id: string }
    db.prepare(
      "INSERT INTO sessions (id,council_id,topic,status) VALUES ('q',?,'q','queued'),('r',?,'r','running')",
    ).run(council.id, council.id)
    expect(recoverInterruptedSessions(db)).toBe(2)
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE status='failed' AND error LIKE 'process restarted%'").get(),
    ).toEqual({ n: 2 })
  })

  it('allows councils to be created and updated with up to 100 rounds', () => {
    expect(() => {
      db.prepare(
        "INSERT INTO councils (id, name, description, strategy, rounds) VALUES ('c-100', 'Big Debate', '', 'review', 100)",
      ).run()
    }).not.toThrow()
    const row = db.prepare('SELECT rounds FROM councils WHERE id = ?').get('c-100') as { rounds: number }
    expect(row.rounds).toBe(100)
  })
})
