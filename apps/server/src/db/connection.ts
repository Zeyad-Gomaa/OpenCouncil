/** SQLite connection + embedded migrations. */
import type { AppConfig } from '../config.js'

interface StatementResultingChanges {
  changes: number | bigint
  lastInsertRowid: number | bigint
}

interface StatementSync {
  all(...anonymousParameters: unknown[]): unknown[]
  get(...anonymousParameters: unknown[]): unknown
  run(...anonymousParameters: unknown[]): StatementResultingChanges
}

export interface DB {
  close(): void
  exec(sql: string): void
  prepare(sql: string): StatementSync
}

const getBuiltinModule = (process as typeof process & { getBuiltinModule(id: string): unknown }).getBuiltinModule
const { DatabaseSync } = getBuiltinModule('node:sqlite') as {
  DatabaseSync: new (location: string) => DB
}

export function openDatabase(config: AppConfig): DB {
  const db = new DatabaseSync(config.databasePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial-schema',
    sql: `
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai_compatible','anthropic','google','mock')),
  base_url TEXT,
  api_key_encrypted TEXT,
  default_model_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  context_window INTEGER,
  input_per_mtok_usd REAL,
  output_per_mtok_usd REAL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (provider_id, model_id)
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE SET NULL,
  system_prompt TEXT,
  temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER,
  avatar_color TEXT NOT NULL DEFAULT '#c9a227',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE councils (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin','debate')),
  rounds INTEGER NOT NULL DEFAULT 1 CHECK (rounds BETWEEN 1 AND 100),
  moderator_member_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE council_members (
  council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (council_id, member_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  council_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_council ON sessions(council_id);
CREATE INDEX idx_sessions_status ON sessions(status);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id TEXT,
  member_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  kind TEXT NOT NULL CHECK (kind IN ('user','discussion','synthesis','system')),
  round INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_messages_session ON messages(session_id, id);

CREATE TABLE usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  member_name TEXT,
  provider_name TEXT,
  model_name TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_usage_created ON usage_events(created_at);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE settings_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    name: 'historical-snapshots-and-usage-identifiers',
    sql: `
ALTER TABLE council_members RENAME TO council_members_v1;
ALTER TABLE members RENAME TO members_v1;
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
  system_prompt TEXT,
  temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER,
  avatar_color TEXT NOT NULL DEFAULT '#c9a227',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO members SELECT * FROM members_v1;
DROP TABLE members_v1;
CREATE TABLE council_members (
  council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (council_id, member_id)
);
INSERT INTO council_members SELECT * FROM council_members_v1;
DROP TABLE council_members_v1;
ALTER TABLE sessions ADD COLUMN snapshot_json TEXT;
ALTER TABLE usage_events ADD COLUMN provider_id TEXT;
ALTER TABLE usage_events ADD COLUMN model_id TEXT;
ALTER TABLE usage_events ADD COLUMN member_id TEXT;
ALTER TABLE messages ADD COLUMN round_position INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_usage_session ON usage_events(session_id);
CREATE TABLE session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(session_id, sequence)
);
CREATE INDEX idx_session_events_sequence ON session_events(session_id, sequence);
`,
  },
  {
    version: 3,
    name: 'usage-retries-and-errors',
    sql: `
ALTER TABLE usage_events ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN error_code TEXT;
`,
  },
  {
    version: 4,
    name: 'expand-council-rounds',
    sql: `
ALTER TABLE council_members RENAME TO council_members_v4;
ALTER TABLE councils RENAME TO councils_v4;
CREATE TABLE councils (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin','debate')),
  rounds INTEGER NOT NULL DEFAULT 1 CHECK (rounds BETWEEN 1 AND 100),
  moderator_member_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO councils SELECT * FROM councils_v4;
DROP TABLE councils_v4;
CREATE TABLE council_members (
  council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (council_id, member_id)
);
INSERT INTO council_members SELECT * FROM council_members_v4;
DROP TABLE council_members_v4;
`,
  },
]

export function migrate(db: DB): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)')
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  )
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

export function recoverInterruptedSessions(db: DB): number {
  const result = db
    .prepare(
      `UPDATE sessions SET status='failed', error='process restarted before session completed', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status IN ('queued','running')`,
    )
    .run()
  return Number(result.changes)
}
