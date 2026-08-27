'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '../lib/api'
import type { SessionDTO } from '@opencouncil/shared'

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionDTO[]>([])
  const [search, setSearch] = useState('')
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

  const filtered = sessions.filter((s) => s.topic.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>Sessions</h1>
          <p className="subtitle">Every deliberation, most recent first.</p>
        </div>
        <Link className="btn primary" href="/">
          New session
        </Link>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="search-bar" style={{ marginBottom: 20 }}>
        <svg
          className="search-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="7" cy="7" r="5" />
          <path d="M12 12l-2.5-2.5" />
        </svg>
        <input
          type="text"
          placeholder="Search sessions by topic…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">—</div>
          {search ? 'No sessions match that search.' : 'No sessions yet. Start from Home.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((s, i) => (
            <Link
              key={s.id}
              href={`/sessions/view/?id=${s.id}`}
              className="session-card"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <div className="session-topic">{s.topic.length > 120 ? s.topic.slice(0, 120) + '…' : s.topic}</div>
              <div className="session-meta">
                <span className={`badge ${s.status}`}>{s.status}</span>
                <span>{s.councilName || 'Unknown council'}</span>
                {s.messageCount != null && <span>{s.messageCount} msgs</span>}
                <span>{s.createdAt ? timeAgo(s.createdAt) : ''}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
