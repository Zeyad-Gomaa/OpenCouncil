/** OpenCouncil CLI — one command, one port, full council.
 *
 * Serves the REST/SSE API (Fastify) and the chamber UI (Next.js, programmatic)
 * from a single HTTP server. Designed to run after `npm run build` at the repo
 * root, whether from a source checkout or a global/git npm install.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface Args {
  host: string
  port: number
  databasePath?: string
  seed: boolean
  help: boolean
  version: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { host: '127.0.0.1', port: 4311, seed: true, help: false, version: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    switch (a) {
      case '-p':
      case '--port':
        args.port = Number.parseInt(argv[++i] ?? '', 10) || 4311
        break
      case '-H':
      case '--host':
        args.host = argv[++i] ?? args.host
        break
      case '--db':
        args.databasePath = argv[++i]
        break
      case '--no-seed':
        args.seed = false
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
        if (!a.startsWith('-')) {
          // first positional: allow `opencouncil <port>` shorthand
          const n = Number.parseInt(a, 10)
          if (!Number.isNaN(n)) args.port = n
        }
    }
  }
  return args
}

function printHelp(): void {
  console.log(`
  🏛 OpenCouncil — convene your LLMs as a council

  Usage: opencouncil [options] [port]

  Options:
    -p, --port <n>     HTTP port (default 4311)
    -H, --host <addr>  Bind address (default 127.0.0.1; use 0.0.0.0 with care)
        --db <path>    SQLite database file (default ./data/opencouncil.db)
        --no-seed      Skip demo council seeding on empty database
    -v, --version      Print version
    -h, --help         This help

  Environment:
    OPEN_COUNCIL_SECRET_KEY  Master key encrypting provider API keys at rest
                             (required for keys to survive restarts)
    SEED_DEMO_COUNCIL        Set to "false" to disable seeding
    LOG_LEVEL                fatal|error|warn|info|debug|trace

  Then open http://localhost:<port> — the seeded mock council lets you watch a
  full deliberation immediately. Add your own providers under Settings.
`)
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const here = path.dirname(fileURLToPath(import.meta.url)) // apps/server/dist
  const packageRoot = path.resolve(here, '..', '..', '..')
  const webDir = path.join(packageRoot, 'apps', 'web')

  // Config: env-first, CLI overrides layered on top.
  process.env.HOST = args.host
  process.env.PORT = String(args.port)
  if (args.databasePath) process.env.DATABASE_PATH = args.databasePath
  if (!args.seed) process.env.SEED_DEMO_COUNCIL = 'false'
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'

  const { loadConfig } = await import('./config.js')
  const config = loadConfig()

  const { initVault } = await import('./vault/crypto.js')
  initVault(config.secretKey)

  const { openDatabase, migrate } = await import('./db/connection.js')
  const { seedDemoCouncil } = await import('./db/seed.js')
  const db = openDatabase(config)
  migrate(db)
  if (config.seedDemoCouncil && seedDemoCouncil(db)) {
    console.log('[opencouncil] seeded demo council (mock provider)')
  }
  if (!config.hasDurableSecret) {
    console.warn(
      '[opencouncil] WARNING: OPEN_COUNCIL_SECRET_KEY not set — provider API keys stored now will be unreadable after restart.',
    )
  }

  const { SessionBus } = await import('./engine/bus.js')
  const { SessionRunner } = await import('./engine/runner.js')
  const { SessionManager } = await import('./engine/session-manager.js')
  const { buildApp, makeRunnerDbHelpers } = await import('./app.js')

  const bus = new SessionBus()
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

  // ---- Chamber UI (Next.js, programmatic, proxied under the same port) ----
  let uiReady = false
  try {
    const nextModule = (await import('next')) as unknown as {
      default?: (opts: Record<string, unknown>) => PromiseLike<unknown>
    } & ((opts: Record<string, unknown>) => PromiseLike<unknown>)
    const nextFactory = (nextModule.default ?? nextModule) as (opts: Record<string, unknown>) => PromiseLike<unknown>
    const nextApp = (await nextFactory({ dev: false, dir: webDir })) as {
      prepare(): PromiseLike<void>
      getRequestHandler(): (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>
    }
    await nextApp.prepare()
    const handleNext = nextApp.getRequestHandler()
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url === '/api') {
        reply.status(404).send({ error: { code: 'not_found', message: 'no such API route' } })
        return
      }
      void reply.hijack()
      void handleNext(req.raw, reply.raw)
    })
    uiReady = true
  } catch (err) {
    console.warn(
      `[opencouncil] UI unavailable (${err instanceof Error ? err.message : err}). ` +
        `Build it with \`npm run build\` at the repo root. API remains served.`,
    )
    // No UI to delegate to: plain JSON 404s.
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
