/** OpenCouncil server entrypoint. */
import { loadEnvFile } from './env.js'
import { loadConfig } from './config.js'
import { initVault } from './vault/crypto.js'
import { migrate, openDatabase, recoverInterruptedSessions } from './db/connection.js'
import { seedDemoCouncil } from './db/seed.js'
import { SessionBus } from './engine/bus.js'
import { SessionRunner } from './engine/runner.js'
import { SessionManager } from './engine/session-manager.js'
import { makeRunnerDbHelpers, buildApp } from './app.js'

async function main(): Promise<void> {
  loadEnvFile()
  const config = loadConfig()
  initVault(config.secretKey)

  const db = openDatabase(config)
  migrate(db)
  const interrupted = recoverInterruptedSessions(db)
  if (interrupted) console.warn(`[opencouncil] marked ${interrupted} interrupted session(s) failed after restart`)
  if (config.seedDemoCouncil && seedDemoCouncil(db)) {
    console.log('[opencouncil] seeded demo council (mock provider)')
  }
  if (!config.hasDurableSecret) {
    console.warn(
      '[opencouncil] WARNING: OPEN_COUNCIL_SECRET_KEY not set — provider API keys stored now will be unreadable after restart. Set it in .env for production use.',
    )
  }

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
    loadWorkspace: helpers.loadWorkspace,
    loadResearchEnabled: helpers.loadResearchEnabled,
    loadSessionOptions: helpers.loadSessionOptions,
    saveSessionResult: helpers.saveSessionResult,
    maxSessionUsd: config.maxSessionUsd,
    researchEnabled: config.researchEnabled,
  })
  const sessions = new SessionManager(bus, runner)

  const app = await buildApp({ config, db, bus, sessions })

  // Plain API server entrypoint: JSON 404s for everything.
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: 'not_found', message: 'no such route' } })
  })

  await app.listen({ host: config.host, port: config.port })
  console.log(`[opencouncil] chamber open at http://${config.host}:${config.port}`)
}

main().catch((err) => {
  console.error('[opencouncil] fatal:', err)
  process.exit(1)
})
