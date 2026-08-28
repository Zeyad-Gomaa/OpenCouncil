'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiGet, apiSend } from './lib/api'
import { STRATEGY_LABELS, type CouncilDTO, type SessionDTO } from '@opencouncil/shared'

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
          <div className="skeleton" style={{ width: 220, height: 36, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: 360, height: 18 }} />
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
  const [workspacePath, setWorkspacePath] = useState('')
  const [workspaceFiles, setWorkspaceFiles] = useState('')
  const [workspaceNote, setWorkspaceNote] = useState<string | null>(null)
  const [attachOpen, setAttachOpen] = useState(false)

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem('oc.workspace')
      if (!saved) return
      const parsed = JSON.parse(saved) as { path?: string; files?: string }
      if (parsed.path) {
        setWorkspacePath(parsed.path)
        setAttachOpen(true)
      }
      if (parsed.files) setWorkspaceFiles(parsed.files)
    } catch {
      /* ignore */
    }
  }, [])

  async function convene() {
    if (!councilId || !topic.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const files = workspaceFiles
        .split(/[, \n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      try {
        if (workspacePath.trim()) {
          localStorage.setItem('oc.workspace', JSON.stringify({ path: workspacePath.trim(), files: workspaceFiles }))
        }
      } catch {
        /* ignore */
      }
      const s = await apiSend<{ id: string }>('/sessions', 'POST', {
        councilId,
        topic: topic.trim(),
        ...(workspacePath.trim() ? { workspacePath: workspacePath.trim() } : {}),
        ...(files.length ? { workspaceFiles: files } : {}),
      })
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
        <div className="skeleton" style={{ width: 220, height: 36, marginBottom: 12 }} />
        <div className="skeleton" style={{ width: 360, height: 18 }} />
      </div>
    )
  }

  return (
    <div>
      <div className="chat-hero">
        <p className="eyebrow">OpenCouncil</p>
        <h1>What should the council consider?</h1>
        <p className="subtitle">Several models research, debate, and agree — live, on your keys.</p>

        {councils.length === 0 ? (
          <div style={{ marginTop: 28 }}>
            <p className="muted">No councils yet. Add a provider and mint a council first.</p>
            <Link href="/settings" className="btn primary" style={{ marginTop: 16 }}>
              Open settings
            </Link>
          </div>
        ) : (
          <>
            <div className="council-picker">
              {councils.map((c) => (
                <button
                  key={c.id}
                  type="button"
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
                  placeholder="Ask anything…"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={busy}
                  rows={2}
                  autoFocus
                />
                <button
                  className="send-btn"
                  onClick={convene}
                  disabled={busy || !councilId || !topic.trim()}
                  aria-label="Convene council"
                >
                  {busy ? (
                    <svg width="16" height="16" viewBox="0 0 18 18" style={{ animation: 'spin 1s linear infinite' }}>
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </button>
              </div>
              {selected && (
                <div className="chat-input-meta">
                  <span className="muted">
                    {STRATEGY_LABELS[selected.strategy] || selected.strategy} · {selected.members.length} members ·{' '}
                    {selected.rounds} {selected.rounds === 1 ? 'round' : 'rounds'}
                    {selected.moderatorMemberId ? ' · Moderated' : ''}
                  </span>
                  <button
                    type="button"
                    className={`ghost sm attach-toggle ${attachOpen || workspacePath ? 'on' : ''}`}
                    onClick={() => setAttachOpen((v) => !v)}
                  >
                    {workspacePath.trim() ? 'Folder attached' : 'Attach folder'}
                  </button>
                </div>
              )}

              {attachOpen && (
                <div className="workspace-attach">
                  <label>Local folder or file</label>
                  <input
                    value={workspacePath}
                    onChange={(e) => {
                      setWorkspacePath(e.target.value)
                      setWorkspaceNote(null)
                    }}
                    placeholder="/absolute/path/to/repo"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <input
                    value={workspaceFiles}
                    onChange={(e) => setWorkspaceFiles(e.target.value)}
                    placeholder="Optional files to prioritize: src/app.ts, README.md"
                    style={{ marginTop: 8 }}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className="workspace-attach-row">
                    <span className="input-hint">
                      This process reads the path. Agents can list, read, and search — they cannot write.
                    </span>
                    <div className="workspace-attach-actions">
                      {workspacePath && (
                        <button
                          type="button"
                          className="ghost sm"
                          onClick={() => {
                            setWorkspacePath('')
                            setWorkspaceFiles('')
                            setWorkspaceNote(null)
                            try {
                              localStorage.removeItem('oc.workspace')
                            } catch {
                              /* ignore */
                            }
                          }}
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        className="ghost sm"
                        disabled={!workspacePath.trim() || busy}
                        onClick={async () => {
                          setWorkspaceNote(null)
                          try {
                            const files = workspaceFiles
                              .split(/[, \n]+/)
                              .map((s) => s.trim())
                              .filter(Boolean)
                            const res = await apiSend<{ ok: boolean; root: string; fileCount: number }>(
                              '/workspace/preview',
                              'POST',
                              { path: workspacePath.trim(), files },
                            )
                            setWorkspaceNote(`Ready · ${res.fileCount} files from ${res.root}`)
                            try {
                              localStorage.setItem(
                                'oc.workspace',
                                JSON.stringify({ path: workspacePath.trim(), files: workspaceFiles }),
                              )
                            } catch {
                              /* ignore */
                            }
                          } catch (e) {
                            setWorkspaceNote(e instanceof Error ? e.message : String(e))
                          }
                        }}
                      >
                        Check path
                      </button>
                    </div>
                  </div>
                  {selected && ['review', 'architect', 'red_team'].includes(selected.strategy) && (
                    <p className="input-hint">This council is a coding mode — attaching the repo is the point.</p>
                  )}
                  {workspaceNote && (
                    <p className={workspaceNote.startsWith('Ready') ? 'notice' : 'form-error'}>{workspaceNote}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {error && <p className="form-error">{error}</p>}
      </div>

      {sessions.length > 0 && (
        <div className="home-recent">
          <div className="home-recent-head">
            <h2>Recent</h2>
            <Link href="/sessions">View all</Link>
          </div>
          <div className="home-recent-list">
            {sessions.map((s) => (
              <Link key={s.id} href={`/sessions/view/?id=${s.id}`} className="session-card">
                <div className="session-topic">{s.topic.length > 120 ? s.topic.slice(0, 120) + '…' : s.topic}</div>
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
