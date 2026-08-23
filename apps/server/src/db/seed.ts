/** First-boot demo seeding: a mock provider + model + council of three, so the
 * chamber can be experienced with zero API keys. */
import { randomUUID } from 'node:crypto'
import type { DB } from './connection.js'

const PALETTE = ['#c9a227', '#4f86c6', '#a0522d', '#557a46', '#8e5ea2', '#b0413e']

export function seedDemoCouncil(db: DB): boolean {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM councils').get() as { n: number }
  if (existing.n > 0) return false

  const providerId = randomUUID()
  db.prepare(
    `INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, default_model_id, enabled)
     VALUES (?, ?, 'mock', NULL, NULL, NULL, 1)`,
  ).run(providerId, 'Demo (Mock)')

  const models = [
    { id: randomUUID(), modelId: 'demo-oracle', name: 'Oracle of the East' },
    { id: randomUUID(), modelId: 'demo-skeptic', name: 'Skeptic of the West' },
    { id: randomUUID(), modelId: 'demo-moderator', name: 'Arbiter Prime' },
  ]
  const insertModel = db.prepare(
    `INSERT INTO models (id, provider_id, model_id, display_name, enabled) VALUES (?, ?, ?, ?, 1)`,
  )
  for (const m of models) {
    insertModel.run(m.id, providerId, m.modelId, m.name)
  }

  const members = [
    {
      id: randomUUID(),
      name: 'The Oracle',
      modelIdx: 0,
      prompt:
        'You are The Oracle — visionary, big-picture thinker. Propose bold, well-structured solutions and consider second-order effects.',
      color: PALETTE[0]!,
    },
    {
      id: randomUUID(),
      name: 'The Skeptic',
      modelIdx: 1,
      prompt:
        'You are The Skeptic — ruthless stress-tester. Challenge assumptions, hunt for flaws, demand evidence. Concede only to strong arguments.',
      color: PALETTE[3]!,
    },
    {
      id: randomUUID(),
      name: 'The Arbiter',
      modelIdx: 2,
      prompt:
        'You are The Arbiter — balanced chair. Weigh all positions fairly and synthesize the strongest consensus.',
      color: PALETTE[1]!,
    },
  ]
  const insertMember = db.prepare(
    `INSERT INTO members (id, name, model_id, system_prompt, temperature, max_tokens, avatar_color, enabled)
     VALUES (?, ?, ?, ?, 0.7, 1200, ?, 1)`,
  )
  for (const m of members) {
    insertMember.run(m.id, m.name, models[m.modelIdx]!.id, m.prompt, m.color)
  }

  const councilId = randomUUID()
  db.prepare(
    `INSERT INTO councils (id, name, description, strategy, rounds, moderator_member_id)
     VALUES (?, 'Founding Council', 'Demo council running on the built-in mock provider.', 'debate', 2, ?)`,
  ).run(councilId, members[2]!.id)

  const insertCM = db.prepare('INSERT INTO council_members (council_id, member_id, position) VALUES (?, ?, ?)')
  members.forEach((m, i) => insertCM.run(councilId, m.id, i))

  return true
}
