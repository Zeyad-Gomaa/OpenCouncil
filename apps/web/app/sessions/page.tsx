'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '../lib/api'
import type { SessionDTO } from '@opencouncil/shared'

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionDTO[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = () =>
      apiGet<SessionDTO[]>('/sessions?limit=200')
        .then(setSessions)
        .catch((e) => setError(String(e)))
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [])

  return (
    <div>
      <h1>Sessions</h1>
      <p className="subtitle">Every deliberation ever convened, most recent first.</p>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Council</th>
              <th>Status</th>
              <th>Messages</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--text-faint)' }}>No sessions yet. Convene your first council.</td></tr>
            )}
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/sessions/view/?id=${s.id}`}>{s.topic.slice(0, 80)}{s.topic.length > 80 ? '…' : ''}</Link>
                </td>
                <td>{s.councilName}</td>
                <td><span className={`badge ${s.status}`}>{s.status}</span></td>
                <td>{s.messageCount ?? 0}</td>
                <td style={{ color: 'var(--text-faint)' }}>
                  {s.startedAt ? new Date(s.startedAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
