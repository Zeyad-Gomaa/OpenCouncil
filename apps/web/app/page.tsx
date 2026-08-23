'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet, apiSend } from './lib/api'
import type { CouncilDTO } from '@opencouncil/shared'

export default function ConvenePage() {
  const router = useRouter()
  const [councils, setCouncils] = useState<CouncilDTO[]>([])
  const [councilId, setCouncilId] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<CouncilDTO[]>('/councils')
      .then((cs) => {
        setCouncils(cs)
        if (cs.length > 0) setCouncilId(cs[0]!.id)
      })
      .catch((e) => setError(String(e)))
  }, [])

  async function convene() {
    if (!councilId || !topic.trim()) return
    setBusy(true)
    setError(null)
    try {
      const session = await apiSend<{ id: string }>('/sessions', 'POST', { councilId, topic: topic.trim() })
      router.push(`/sessions/${session.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Convene the Council</h1>
      <p className="subtitle">Put a question before your assembled models. They will deliberate and agree.</p>

      <div className="card">
        <label htmlFor="council">Council</label>
        <select id="council" value={councilId} onChange={(e) => setCouncilId(e.target.value)}>
          {councils.length === 0 && <option value="">No councils yet — create one in Settings</option>}
          {councils.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.members.length} members · {c.strategy} × {c.rounds}
              {c.moderatorMemberId ? ' · moderated' : ''}
            </option>
          ))}
        </select>

        <label htmlFor="topic">Question before the council</label>
        <textarea
          id="topic"
          rows={5}
          placeholder="State the matter for deliberation…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        <div style={{ marginTop: 16 }}>
          <button className="primary" onClick={convene} disabled={busy || !councilId || !topic.trim()}>
            {busy ? 'Convening…' : 'Convene'}
          </button>
        </div>
      </div>
    </div>
  )
}
