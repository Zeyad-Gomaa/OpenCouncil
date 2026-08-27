'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiGet, apiSend } from './lib/api'
import type { CouncilDTO, SessionDTO } from '@opencouncil/shared'

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

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="chat-hero">
          <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: 340, height: 18 }} />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTopic = searchParams.get('topic') ?? ''

  const [councils, setCouncils] = useState<CouncilDTO[]>([])
  const [sessions, setSessions] = useState<SessionDTO[]>([])
  const [councilId, setCouncilId] = useState('')
  const [topic, setTopic] = useState(initialTopic)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      apiGet<CouncilDTO[]>('/councils').catch(() => [] as CouncilDTO[]),
      apiGet<SessionDTO[]>('/sessions?limit=6').catch(() => [] as SessionDTO[]),
    ]).then(([cs, ss]) => {
      setCouncils(cs)
      setSessions(ss)
      if (cs.length > 0) setCouncilId(cs[0]!.id)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic)
  }, [initialTopic])

  async function convene() {
    if (!councilId || !topic.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const s = await apiSend<{ id: string }>('/sessions', 'POST', { councilId, topic: topic.trim() })
      router.push(`/sessions/view/?id=${s.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      convene()
    }
  }

  const selected = councils.find((c) => c.id === councilId)

  if (!loaded) {
    return (
      <div className="chat-hero">
        <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 12 }} />
        <div className="skeleton" style={{ width: 340, height: 18 }} />
      </div>
    )
  }

  return (
    <div>
      <div className="chat-hero">
        <h1>OpenCouncil</h1>
        <p className="subtitle">Structured deliberation across your configured models.</p>

        {councils.length === 0 ? (
          <div style={{ marginTop: 24 }}>
            <p className="muted">No councils configured yet.</p>
            <Link href="/settings" className="btn primary" style={{ marginTop: 12 }}>
              Go to Configuration →
            </Link>
          </div>
        ) : (
          <>
            <div className="council-picker">
              {councils.map((c) => (
                <button
                  key={c.id}
                  className={`chip ${c.id === councilId ? 'active' : ''}`}
                  onClick={() => setCouncilId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="chat-input-wrap">
              <div className="chat-input-box">
                <textarea
                  placeholder="What should the council deliberate on?"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={busy}
                  rows={2}
                />
                <button
                  className="send-btn"
                  onClick={convene}
                  disabled={busy || !councilId || !topic.trim()}
                  aria-label="Convene council"
                >
                  {busy ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle
                        cx="9"
                        cy="9"
                        r="7"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                        strokeDasharray="32"
                        strokeDashoffset="10"
                      />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              </div>
              {selected && (
                <div className="chat-input-meta">
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {selected.strategy === 'debate' ? '⚔ Debate' : '↻ Round Robin'} · {selected.members.length}{' '}
                    members · {selected.rounds} {selected.rounds === 1 ? 'round' : 'rounds'}
                    {selected.moderatorMemberId ? ' · Moderated' : ''}
                  </span>
                  <span className="muted" style={{ fontSize: '0.75rem' }}>
                    {topic.length > 0 ? `${topic.length} chars` : ''}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {error && <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: '0.85rem' }}>{error}</p>}
      </div>

      {sessions.length > 0 && (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Recent sessions</h2>
            <Link href="/sessions" style={{ fontSize: '0.82rem' }}>
              View all →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((s, i) => (
              <Link
                key={s.id}
                href={`/sessions/view/?id=${s.id}`}
                className="session-card"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="session-topic">
                  {s.topic.length > 120 ? s.topic.slice(0, 120) + '…' : s.topic}
                </div>
                <div className="session-meta">
                  <span className={`badge ${s.status}`}>{s.status}</span>
                  <span>{s.councilName || 'Unknown'}</span>
                  {s.messageCount != null && <span>{s.messageCount} msgs</span>}
                  <span>{s.createdAt ? timeAgo(s.createdAt) : ''}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
