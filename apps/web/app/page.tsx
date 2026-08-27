'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiGet, apiSend } from './lib/api'
import type { CouncilDTO } from '@opencouncil/shared'
import type { SessionDTO } from '@opencouncil/shared'

export default function ConvenePage() {
  const router = useRouter()
  const [councils, setCouncils] = useState<CouncilDTO[]>([])
  const [councilId, setCouncilId] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionDTO[]>([])

  useEffect(() => {
    apiGet<CouncilDTO[]>('/councils')
      .then((cs) => {
        setCouncils(cs)
        if (cs.length > 0) setCouncilId(cs[0]!.id)
      })
      .catch((e) => setError(String(e)))
    apiGet<SessionDTO[]>('/sessions?limit=5')
      .then(setSessions)
      .catch(() => {})
  }, [])

  async function convene() {
    if (!councilId || !topic.trim()) return
    setBusy(true)
    setError(null)
    try {
      const session = await apiSend<{ id: string }>('/sessions', 'POST', { councilId, topic: topic.trim() })
      router.push(`/sessions/view/?id=${session.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Good to see you.</h1>
          <p className="subtitle">Run a structured deliberation across your configured council members.</p>
        </div>
        <Link className="btn" href="/sessions">
          View all sessions →
        </Link>
      </div>

      <div className="dashboard-grid">
        <div className="hero-card">
          <h2>Start a new deliberation</h2>
          <p>
            Frame a decision, research question, or strategic brief. Your council will work through it using the
            protocol and rounds you define.
          </p>
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

          <label htmlFor="topic">Decision or question</label>
          <textarea
            id="topic"
            rows={5}
            placeholder="State the matter for deliberation…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="form-actions">
            <span className="muted">Results stream live as members respond.</span>
            <button className="primary" onClick={convene} disabled={busy || !councilId || !topic.trim()}>
              {busy ? 'Convening…' : 'Convene'}
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">
            <h2>Recent sessions</h2>
            <Link href="/sessions">See all</Link>
          </div>
          {sessions.length === 0 ? (
            <div className="empty">No sessions yet.</div>
          ) : (
            sessions.map((s) => (
              <div key={s.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <Link className="topic" href={`/sessions/view/?id=${s.id}`}>
                  {s.topic.slice(0, 70)}
                  {s.topic.length > 70 ? '…' : ''}
                </Link>
                <div style={{ marginTop: 7 }}>
                  <span className={`badge ${s.status}`}>{s.status}</span>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {s.councilName}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
