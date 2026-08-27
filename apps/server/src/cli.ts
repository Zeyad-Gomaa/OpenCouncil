/** OpenCouncil CLI — one command, one port, full council.
 *
 * Serves the REST/SSE API (Fastify) and the chamber UI (Next.js, programmatic)
 * from a single HTTP server. Designed to run after `npm run build` at the repo
 * root, whether from a source checkout or a global/git npm install.
 */
import path from 'node:path'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { encryptSecret } from './vault/crypto.js'
import type { DB } from './db/connection.js'

interface Args {
  command: 'serve' | 'doctor' | 'provider' | 'model' | 'member' | 'council' | 'session' | 'usage'
  subcommand?: string
  /** Undefined unless the flag was actually passed — env config fills the gap. */
  host?: string
  port?: number
  databasePath?: string
  seed: boolean
  help: boolean
  version: boolean
  json: boolean
  options: Record<string, string | boolean>
  positionals: string[]
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: 'serve',
    seed: true,
    help: false,
    version: false,
    json: false,
    options: {},
    positionals: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    switch (a) {
      case '-p':
      case '--port':
        {
          const value = argv[++i]
          const port = Number(value)
          if (!value || !Number.isInteger(port) || port < 1 || port > 65535)
            throw new Error(`invalid port: ${value ?? '(missing)'}`)
          args.port = port
        }
        break
      case '-H':
      case '--host':
        {
          const value = argv[++i]
          if (!value || value.startsWith('-')) throw new Error('missing host value')
          args.host = value
        }
        break
      case '--db':
        {
          const value = argv[++i]
          if (!value || value.startsWith('-')) throw new Error('missing --db value')
          args.databasePath = value
        }
        break
      case '--no-seed':
        args.seed = false
        break
      case '--json':
        args.json = true
        break
      case '-v':
      case '--version':
        args.version = true
        break
      case '-h':
      case '--help':
        args.help = true
        break
      default:
        if (a.startsWith('--')) {
          const key = a.slice(2)
          if (
            ![
              'council',
              'id',
              'name',
              'protocol',
              'base-url',
              'api-key',
              'provider',
              'model-id',
              'context-window',
              'model',
              'prompt',
              'temperature',
              'max-tokens',
              'color',
            ].includes(key)
          )
            throw new Error(`unknown option: ${a}`)
          const next = argv[i + 1]
          if (next && !next.startsWith('-')) {
            args.options[key] = next
            i++
          } else args.options[key] = true
          break
        }
        if (a.startsWith('-')) throw new Error(`unknown option: ${a}`)
        if (args.command === 'serve' && /^\d+$/.test(a)) {
          const port = Number(a)
          if (port < 1 || port > 65535) throw new Error(`invalid port: ${a}`)
          args.port = port
          break
        }
        if (
          args.command === 'serve' &&
          ['serve', 'doctor', 'provider', 'model', 'member', 'council', 'session', 'usage'].includes(a)
        ) {
          args.command = a as Args['command']
          break
        }
        if (['provider', 'model', 'member', 'council', 'session'].includes(args.command) && !args.subcommand) {
          args.subcommand = a
          break
        }
        args.positionals.push(a)
    }
  }
  return args
}

function printHelp(): void {
  console.log(`
  🏛 OpenCouncil — convene your LLMs as a council

  Usage: opencouncil [command] [options]

  Commands:
    serve               Start the API and static UI (default)
    doctor              Check local database and package prerequisites
    provider list        List providers
    model list           List models
    member list          List members
    council list        List configured councils
    session list        List recent sessions
    usage               Show aggregate usage totals

  Options:
    -p, --port <n>     HTTP port (default 4311)
    -H, --host <addr>  Bind address (default 127.0.0.1; use 0.0.0.0 with care)
        --db <path>    SQLite database file (default ./data/opencouncil.db)
        --no-seed      Skip demo council seeding on empty database
    -v, --version      Print version
    -h, --help         This help
        --json         Machine-readable output for headless commands

  Environment (read from ./.env if present; real env vars win, flags win over both):
    OPEN_COUNCIL_SECRET_KEY  Master key encrypting provider API keys at rest
                             (required for keys to survive restarts)
    OPEN_COUNCIL_ENV_FILE    Alternate env file path (default ./.env)
    HOST, PORT               Bind address and port
    DATABASE_PATH            SQLite database file
    SEED_DEMO_COUNCIL        Set to "false" to disable seeding
    LOG_LEVEL                fatal|error|warn|info|debug|trace

  Then open http://localhost:<port> — the seeded mock council lets you watch a
  full deliberation immediately. Add your own providers under Settings.
`)
}

function printResult(value: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(value))
  else if (Array.isArray(value)) {
    if (value.length === 0) console.log('No results.')
    else for (const row of value) console.log(Object.values(row as Record<string, unknown>).join('\t'))
  } else console.log(value)
}

function runHeadless(
  args: Args,
  db: {
    prepare(sql: string): {
      all(...p: unknown[]): unknown[]
      get(...p: unknown[]): unknown
      run(...p: unknown[]): unknown
    }
    exec(sql: string): void
    close(): void
  },
  packageRoot: string,
): boolean {
  const value = (name: string, fallback?: string): string | undefined => {
    const v = args.options[name]
    return typeof v === 'string' ? v : fallback
  }
  if (args.command === 'provider') {
    if (args.subcommand === 'list')
      printResult(
        db
          .prepare(
            'SELECT id, name, protocol, base_url AS baseUrl, enabled, api_key_encrypted IS NOT NULL AS hasApiKey FROM providers ORDER BY name',
          )
          .all(),
        args.json,
      )
    else if (args.subcommand === 'remove') {
      const id = args.positionals[0] ?? value('id')
      if (!id) throw new Error('provider remove requires an id')
      db.prepare('UPDATE members SET enabled=0 WHERE model_id IN (SELECT id FROM models WHERE provider_id=?)').run(id)
      db.prepare('DELETE FROM providers WHERE id=?').run(id)
      printResult({ ok: true }, args.json)
    } else if (args.subcommand === 'add') {
      const name = value('name')
      const protocol = value('protocol', 'openai_compatible')
      if (!name) throw new Error('provider add requires --name')
      const id = randomUUID()
      db.prepare(
        'INSERT INTO providers (id,name,protocol,base_url,api_key_encrypted,enabled) VALUES (?,?,?,?,?,1)',
      ).run(id, name, protocol, value('base-url') ?? null, value('api-key') ? encryptSecret(value('api-key')!) : null)
      printResult({ id, name, protocol }, args.json)
    } else throw new Error('supported provider commands: list, add, remove')
  } else if (args.command === 'model') {
    if (args.subcommand === 'list')
      printResult(
        db
          .prepare(
            'SELECT m.id, m.model_id AS modelId, m.display_name AS displayName, p.name AS provider, m.enabled FROM models m JOIN providers p ON p.id=m.provider_id ORDER BY p.name,m.display_name',
          )
          .all(),
        args.json,
      )
    else if (args.subcommand === 'remove') {
      const id = args.positionals[0] ?? value('id')
      if (!id) throw new Error('model remove requires an id')
      db.prepare('UPDATE members SET enabled=0 WHERE model_id=?').run(id)
      db.prepare('DELETE FROM models WHERE id=?').run(id)
      printResult({ ok: true }, args.json)
    } else if (args.subcommand === 'add') {
      const providerId = value('provider')
      const modelId = value('model-id')
      const displayName = value('name', modelId)
      if (!providerId || !modelId || !displayName)
        throw new Error('model add requires --provider, --model-id, and --name')
      const id = randomUUID()
      db.prepare(
        'INSERT INTO models (id,provider_id,model_id,display_name,context_window,enabled) VALUES (?,?,?,?,?,1)',
      ).run(id, providerId, modelId, displayName, value('context-window') ? Number(value('context-window')) : null)
      printResult({ id, modelId, displayName }, args.json)
    } else throw new Error('supported model commands: list, add, remove')
  } else if (args.command === 'member') {
    if (args.subcommand === 'list')
      printResult(
        db
          .prepare(
            'SELECT mem.id, mem.name, mem.enabled, m.display_name AS model, p.name AS provider FROM members mem LEFT JOIN models m ON m.id=mem.model_id LEFT JOIN providers p ON p.id=m.provider_id ORDER BY mem.name',
          )
          .all(),
        args.json,
      )
    else if (args.subcommand === 'remove') {
      const id = args.positionals[0] ?? value('id')
      if (!id) throw new Error('member remove requires an id')
      db.prepare('UPDATE councils SET moderator_member_id=NULL WHERE moderator_member_id=?').run(id)
      db.prepare('DELETE FROM members WHERE id=?').run(id)
      printResult({ ok: true }, args.json)
    } else if (args.subcommand === 'add') {
      const name = value('name')
      const modelId = value('model')
      if (!name || !modelId) throw new Error('member add requires --name and --model')
      const id = randomUUID()
      db.prepare(
        'INSERT INTO members (id,name,model_id,system_prompt,temperature,max_tokens,avatar_color,enabled) VALUES (?,?,?,?,?,?,?,1)',
      ).run(
        id,
        name,
        modelId,
        value('prompt') ?? null,
        Number(value('temperature', '0.7')),
        value('max-tokens') ? Number(value('max-tokens')) : null,
        value('color', '#c9a227'),
      )
      printResult({ id, name }, args.json)
    } else throw new Error('supported member commands: list, add, remove')
  } else if (args.command === 'council') {
    if (args.subcommand === 'list') {
      printResult(
        db
          .prepare(
            `SELECT id, name, strategy, rounds, (SELECT COUNT(*) FROM council_members cm WHERE cm.council_id = councils.id) AS members FROM councils ORDER BY created_at`,
          )
          .all(),
        args.json,
      )
    } else if (args.subcommand === 'show') {
      const id = args.positionals[0] ?? value('id')
      if (!id) throw new Error('council show requires an id')
      const council = db.prepare('SELECT * FROM councils WHERE id = ? OR name = ?').get(id, id)
      if (!council) throw new Error('council not found')
      const members = db
        .prepare(
          `SELECT mem.id, mem.name, m.display_name AS model, p.name AS provider FROM council_members cm JOIN members mem ON mem.id=cm.member_id LEFT JOIN models m ON m.id=mem.model_id LEFT JOIN providers p ON p.id=m.provider_id WHERE cm.council_id=? ORDER BY cm.position`,
        )
        .all((council as { id: string }).id)
      printResult({ council, members }, args.json)
    } else if (args.subcommand === 'delete') {
      const id = args.positionals[0] ?? value('id')
      if (!id) throw new Error('council delete requires an id')
      db.prepare('DELETE FROM councils WHERE id = ? OR name = ?').run(id, id)
      printResult({ ok: true }, args.json)
    } else if (args.subcommand === 'run') {
      throw new Error('council run is initialized by the async runner path')
    } else throw new Error('supported council commands: list, show, delete, run')
  } else if (args.command === 'session') {
    if (args.subcommand === 'list')
      printResult(
        db
          .prepare(
            `SELECT s.id, COALESCE(c.name, json_extract(s.snapshot_json, '$.name')) AS council, s.status, s.topic, s.created_at AS createdAt FROM sessions s LEFT JOIN councils c ON c.id = s.council_id ORDER BY s.created_at DESC LIMIT 100`,
          )
          .all(),
        args.json,
      )
    else if (args.subcommand === 'show') {
      const id = args.positionals[0]
      if (!id) throw new Error('session show requires an id')
      printResult(db.prepare('SELECT * FROM sessions WHERE id=?').get(id), args.json)
    } else if (args.subcommand === 'cancel') {
      const id = args.positionals[0]
      if (!id) throw new Error('session cancel requires an id')
      db.prepare(
        "UPDATE sessions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status IN ('queued','running')",
      ).run(id)
      printResult({ ok: true }, args.json)
    } else throw new Error('supported session commands: list, show, cancel')
  } else if (args.command === 'usage') {
    printResult(
      db
        .prepare(
          `SELECT COUNT(*) AS calls, COALESCE(SUM(prompt_tokens),0) AS promptTokens, COALESCE(SUM(completion_tokens),0) AS completionTokens, COALESCE(SUM(total_tokens),0) AS totalTokens, COALESCE(SUM(cost_usd),0) AS costUsd, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors FROM usage_events`,
        )
        .get(),
      args.json,
    )
  } else if (args.command === 'doctor') {
    printResult(
      {
        node: process.versions.node,
        database: 'ok',
        migrations:
          Number((db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n) > 0
            ? 'ok'
            : 'missing',
        staticAssets:
          existsSync(path.join(packageRoot, 'apps', 'server', 'dist', 'public', 'index.html')) ||
          existsSync(path.join(packageRoot, 'apps', 'web', 'out', 'index.html'))
            ? 'ok'
            : 'missing',
        vault: process.env.OPEN_COUNCIL_SECRET_KEY ? 'durable-key-configured' : 'ephemeral-key-warning',
      },
      args.json,
    )
  }
  db.close()
  return args.command !== 'serve'
}

async function runLocalCouncil(args: Args, db: DB): Promise<void> {
  const councilRef = typeof args.options.council === 'string' ? args.options.council : undefined
  const topic = args.positionals.join(' ').trim()
  if (!councilRef || !topic) throw new Error('council run requires --council <id|name> and a question')
  const council = db.prepare('SELECT * FROM councils WHERE id = ? OR name = ?').get(councilRef, councilRef) as
    { id: string; name: string } | undefined
  if (!council) throw new Error('council not found')
  const sessionId = randomUUID()
  const members = db
    .prepare(
      `SELECT mem.id, mem.name, mem.system_prompt, mem.temperature, mem.max_tokens, m.id AS model_id, m.model_id AS model_name, m.display_name, p.id AS provider_id, p.name AS provider_name FROM council_members cm JOIN members mem ON mem.id=cm.member_id LEFT JOIN models m ON m.id=mem.model_id LEFT JOIN providers p ON p.id=m.provider_id WHERE cm.council_id=? ORDER BY cm.position`,
    )
    .all(council.id)
  const councilConfig = db
    .prepare('SELECT id, name, strategy, rounds, moderator_member_id FROM councils WHERE id=?')
    .get(council.id)
  db.prepare(`INSERT INTO sessions (id, council_id, topic, status, snapshot_json) VALUES (?, ?, ?, 'queued', ?)`).run(
    sessionId,
    council.id,
    topic,
    JSON.stringify({ ...(councilConfig as object), members }),
  )
  const { SessionBus } = await import('./engine/bus.js')
  const { SessionRunner } = await import('./engine/runner.js')
  const { makeRunnerDbHelpers } = await import('./app.js')
  const bus = new SessionBus((event, sequence) =>
    db
      .prepare('INSERT INTO session_events (session_id, sequence, type, payload_json) VALUES (?, ?, ?, ?)')
      .run(event.sessionId, sequence, event.type, JSON.stringify(event)),
  )
  const helpers = makeRunnerDbHelpers(db)
  const runner = new SessionRunner({
    bus,
    recordUsage: helpers.recordUsage,
    insertMessage: helpers.insertMessage,
    loadCouncil: helpers.loadCouncil,
    loadModelForChat: helpers.loadModelForChat,
    updateSessionStatus: helpers.updateSessionStatus,
  })
  const unsubscribe = bus.subscribe(sessionId, (event) => console.log(JSON.stringify(event)))
  try {
    await runner.run(sessionId, council.id, topic, new AbortController().signal)
  } finally {
    unsubscribe()
    db.close()
  }
}

export async function main(): Promise<void> {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`[opencouncil] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
    return
  }
  if (args.help) {
    printHelp()
    return
  }
  if (args.version) {
    const { VERSION } = await import('./version.js')
    console.log(VERSION)
    return
  }

  const { loadEnvFile } = await import('./env.js')
  try {
    loadEnvFile()
  } catch (error) {
    console.error(`[opencouncil] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
    return
  }

  const here = path.dirname(fileURLToPath(import.meta.url)) // apps/server/dist
  const packageRoot = path.resolve(here, '..', '..', '..')
  // The packaged CLI carries the static export beside the server bundle.
  // Keep a source-checkout fallback for development.
  const packagedWebDir = path.join(here, 'public')
  const sourceWebDir = path.join(packageRoot, 'apps', 'web', 'out')
  const webOutDir = existsSync(packagedWebDir) ? packagedWebDir : sourceWebDir

  // Config: env-first, CLI overrides layered on top. Assigning unconditionally
  // here would clobber HOST/PORT from the environment with argv defaults.
  if (args.host !== undefined) process.env.HOST = args.host
  if (args.port !== undefined) process.env.PORT = String(args.port)
  if (args.databasePath) process.env.DATABASE_PATH = args.databasePath
  if (!args.seed) process.env.SEED_DEMO_COUNCIL = 'false'
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'

  const { loadConfig } = await import('./config.js')
  const config = loadConfig()

  const { initVault } = await import('./vault/crypto.js')
  initVault(config.secretKey)

  const { openDatabase, migrate, recoverInterruptedSessions } = await import('./db/connection.js')
  const { seedDemoCouncil } = await import('./db/seed.js')
  const db = openDatabase(config)
  migrate(db)
  if (args.command === 'serve') recoverInterruptedSessions(db)
  if (config.seedDemoCouncil && seedDemoCouncil(db) && args.command === 'serve') {
    console.log('[opencouncil] seeded demo council (mock provider)')
  }
  if (!config.hasDurableSecret && args.command === 'serve') {
    console.warn(
      '[opencouncil] WARNING: OPEN_COUNCIL_SECRET_KEY not set — provider API keys stored now will be unreadable after restart.',
    )
  }

  if (args.command === 'council' && args.subcommand === 'run') {
    await runLocalCouncil(args, db)
    return
  }

  if (args.command !== 'serve' && runHeadless(args, db, packageRoot)) return

  const { SessionBus } = await import('./engine/bus.js')
  const { SessionRunner } = await import('./engine/runner.js')
  const { SessionManager } = await import('./engine/session-manager.js')
  const { buildApp, makeRunnerDbHelpers } = await import('./app.js')

  const bus = new SessionBus((event, sequence) => {
    db.prepare('INSERT INTO session_events (session_id, sequence, type, payload_json) VALUES (?, ?, ?, ?)').run(
      event.sessionId,
      sequence,
      event.type,
      JSON.stringify(event),
    )
  })
  const helpers = makeRunnerDbHelpers(db)
  const runner = new SessionRunner({
    bus,
    recordUsage: (u) => helpers.recordUsage(u),
    insertMessage: helpers.insertMessage,
    loadCouncil: helpers.loadCouncil,
    loadModelForChat: helpers.loadModelForChat,
    updateSessionStatus: helpers.updateSessionStatus,
  })
  const sessions = new SessionManager(bus, runner)

  const app = await buildApp({ config, db, bus, sessions })

  // ---- Chamber UI: prebuilt static export served by this process ----
  let uiReady = false
  if (existsSync(webOutDir)) {
    const staticHandler = (await import('@fastify/static')).default
    await app.register(staticHandler, {
      root: webOutDir,
      prefix: '/',
      wildcard: true,
      index: ['index.html'],
    })

    // SPA and HTML route resolver for clean Next.js export routes
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url === '/api') {
        reply.status(404).send({ error: { code: 'not_found', message: 'no such API route' } })
        return
      }
      const rawPath = req.url.split('?')[0] || '/'
      const urlPath = decodeURIComponent(rawPath)

      // 1. Direct file candidate
      const fileCandidate = path.join(webOutDir, urlPath)
      if (existsSync(fileCandidate) && statSync(fileCandidate).isFile()) {
        reply.sendFile(path.relative(webOutDir, fileCandidate))
        return
      }

      // 2. Directory index.html candidate (e.g. /sessions/view/ -> /sessions/view/index.html)
      const dirIndexCandidate = path.join(webOutDir, urlPath, 'index.html')
      if (existsSync(dirIndexCandidate)) {
        reply.type('text/html; charset=utf-8').send(createReadStream(dirIndexCandidate))
        return
      }

      // 3. Named html candidate (e.g. /sessions -> /sessions.html or /sessions/index.html)
      const htmlCandidate = path.join(webOutDir, `${urlPath}.html`)
      if (existsSync(htmlCandidate)) {
        reply.type('text/html; charset=utf-8').send(createReadStream(htmlCandidate))
        return
      }

      // 4. Root index.html fallback for client-side routing
      const rootIndex = path.join(webOutDir, 'index.html')
      if (existsSync(rootIndex)) {
        reply.type('text/html; charset=utf-8').send(createReadStream(rootIndex))
        return
      }

      const fallback = path.join(webOutDir, '404.html')
      if (existsSync(fallback)) {
        reply.status(404).type('text/html; charset=utf-8').send(createReadStream(fallback))
      } else {
        reply.status(404).send({ error: { code: 'not_found', message: 'no such route' } })
      }
    })
    uiReady = true
  } else {
    console.warn(
      `[opencouncil] UI not found at ${webOutDir}. ` + `Build it with \`npm run build\`. API remains served.`,
    )
    app.setNotFoundHandler((_req, reply) => {
      reply.status(404).send({ error: { code: 'not_found', message: 'no such route' } })
    })
  }

  await app.listen({ host: config.host, port: config.port })
  console.log(`[opencouncil] API  → http://${config.host}:${config.port}/api/v1`)
  if (uiReady) console.log(`[opencouncil] UI   → http://${config.host}:${config.port}`)
}

main().catch((err) => {
  console.error('[opencouncil] fatal:', err)
  process.exit(1)
})
