'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiGet, apiSend } from '../../lib/api'
import MarkdownRenderer from '../../components/MarkdownRenderer'
import type { CouncilEvent, MemberLiveStatus, MessageDTO, SessionDTO } from '@opencouncil/shared'

interface Snapshot {
  session: SessionDTO
  messages: MessageDTO[]
  usage: { calls: number; tokens: number; cost: number }
  lastEventSequence: number
}

interface LiveUsage {
  calls: number
  tokens: number
  costUsd: number
}

const STATUS_LABEL: Record<MemberLiveStatus, string> = {
  queued: 'waiting',
  thinking: 'thinking…',
  streaming: 'writing…',
  completed: 'done',
  failed: 'error',
}

export default function ChamberPage() {
  return (
    <Suspense fallback={<p className="subtitle">Opening the chamber…</p>}>
      <ChamberContent />
    </Suspense>
  )
}

function ChamberContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('id')

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [messages, setMessages] = useState<MessageDTO[]>([])
  const [memberStatus, setMemberStatus] = useState<Record<string, MemberLiveStatus>>({})
  const [memberNames, setMemberNames] = useState<Record<string, string>>({})
  const [memberColors, setMemberColors] = useState<Record<string, string>>({})
  const [liveUsage, setLiveUsage] = useState<LiveUsage>({ calls: 0, tokens: 0, costUsd: 0 })
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [interventionText, setInterventionText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const mergeMessage = useCallback((m: MessageDTO) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setError('No session id in URL')
      return
    }
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    async function boot() {
      try {
        const snap = await apiGet<Snapshot>(`/sessions/${sessionId}`)
        if (cancelled) return
        setSnapshot(snap)
        setMessages(snap.messages)
        setLiveUsage({ calls: snap.usage.calls, tokens: snap.usage.tokens, costUsd: snap.usage.cost })

        try {
          const council = await apiGet<{ members: { id: string; name: string; avatarColor: string }[] }>(
            `/councils/${snap.session.councilId}`,
          )
          if (!cancelled) {
            const st: Record<string, MemberLiveStatus> = {}
            const names: Record<string, string> = {}
            const colors: Record<string, string> = {}
            for (const mem of council.members) {
              st[mem.id] = 'queued'
              names[mem.id] = mem.name
              colors[mem.id] = mem.avatarColor || '#a3a3a3'
            }
            setMemberStatus(st)
            setMemberNames(names)
            setMemberColors(colors)
          }
        } catch {
          /* council may be deleted */
        }

        if (['completed', 'failed', 'cancelled'].includes(snap.session.status)) return

        const connect = () => {
          if (cancelled) return
          esRef.current?.close()
          const es = new EventSource(`/api/v1/sessions/${sessionId}/events?after=${snap.lastEventSequence}`)
          esRef.current = es
          es.onmessage = (ev) => {
            let event: CouncilEvent & { message?: MessageDTO }
            try {
              event = JSON.parse(ev.data)
            } catch {
              return
            }
            switch (event.type) {
              case 'session.started':
                setSnapshot((s) => s && { ...s, session: { ...s.session, status: 'running' } })
                break
              case 'member.started':
                setMemberStatus((st) => ({ ...st, [event.memberId]: 'thinking' }))
                break
              case 'message.created':
                if (event.message) {
                  mergeMessage(event.message)
                  if (event.message.kind !== 'system' && event.message.role === 'assistant') {
                    if (event.message.memberId)
                      setMemberStatus((st) => ({ ...st, [event.message!.memberId!]: 'completed' }))
                  }
                }
                break
              case 'message.replay':
                if (event.message) mergeMessage(event.message)
                break
              case 'member.completed':
                setMemberStatus((st) => ({ ...st, [event.memberId]: 'completed' }))
                break
              case 'member.failed':
                setMemberStatus((st) => ({ ...st, [event.memberId]: 'failed' }))
                break
              case 'session.extended':
                setActionNotice(`Debate extended by +${event.additionalRounds} round(s) (Total: ${event.totalRounds})`)
                break
              case 'session.concluding':
                setActionNotice('Wrapping up — synthesizing consensus…')
                break
              case 'usage.recorded':
                setLiveUsage((current) => ({
                  calls: current.calls + 1,
                  tokens: current.tokens + event.usage.totalTokens,
                  costUsd: current.costUsd + (event.usage.costUsd ?? 0),
                }))
                break
              case 'synthesis.completed':
                if (event.message) mergeMessage(event.message)
                break
              case 'session.completed':
                setSnapshot((s) => s && { ...s, session: { ...s.session, status: 'completed' } })
                setActionNotice(null)
                es.close()
                break
              case 'session.failed':
                setError(event.error)
                setSnapshot((s) => s && { ...s, session: { ...s.session, status: 'failed' } })
                setActionNotice(null)
                es.close()
                break
              case 'session.cancelled':
                setSnapshot((s) => s && { ...s, session: { ...s.session, status: 'cancelled' } })
                setActionNotice(null)
                es.close()
                break
            }
          }
          es.onerror = () => {
            es.close()
            if (!cancelled) retryTimer = setTimeout(connect, 2000)
          }
        }
        connect()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    void boot()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      esRef.current?.close()
    }
  }, [sessionId, mergeMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  async function handleCancel() {
    try {
      setActionBusy(true)
      await apiSend(`/sessions/${sessionId}/cancel`, 'POST')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleExtend(additionalRounds: number) {
    try {
      setActionBusy(true)
      await apiSend(`/sessions/${sessionId}/extend`, 'POST', { additionalRounds })
      setActionNotice(`Requested +${additionalRounds} additional round(s)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleConclude() {
    try {
      setActionBusy(true)
      await apiSend(`/sessions/${sessionId}/conclude`, 'POST', { reason: 'User requested early synthesis' })
      setActionNotice('Concluding — moderator is synthesizing…')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleIntervene() {
    if (!interventionText.trim() || actionBusy) return
    const text = interventionText.trim()
    setInterventionText('')
    try {
      setActionBusy(true)
      const msg = await apiSend<MessageDTO>(`/sessions/${sessionId}/intervene`, 'POST', { content: text })
      mergeMessage(msg)
      setActionNotice('Directive delivered to the council')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRerun() {
    try {
      setActionBusy(true)
      const res = await apiSend<{ id: string }>(`/sessions/${sessionId}/rerun`, 'POST')
      router.push(`/sessions/view/?id=${res.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActionBusy(false)
    }
  }

  const session = snapshot?.session
  const synthesis = [...messages].reverse().find((m) => m.kind === 'synthesis')
  const discussion = messages.filter((m) => m.kind !== 'synthesis')
  const running = session?.status === 'running' || session?.status === 'queued'
  const rounds = [...new Set(discussion.map((m) => m.round))].sort((a, b) => a - b)
  const currentRound = rounds.length > 0 ? Math.max(...rounds) : 0

  if (!session) {
    return (
      <div className="chamber">
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <div className="skeleton" style={{ width: 280, height: 22, margin: '0 auto 12px' }} />
          <div className="skeleton" style={{ width: 180, height: 14, margin: '0 auto' }} />
          {error && <p className="form-error">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="chamber">
      <div className="chamber-header">
        <div className="chamber-header-copy">
          <Link href="/sessions" className="chamber-back">
            History
          </Link>
          <h1>{session.councilName || 'Deliberation'}</h1>
          <p className="chamber-topic">{session.topic}</p>
          <div className="chamber-status-row">
            <span className={`badge ${session.status}`}>{session.status}</span>
            {running && currentRound > 0 && <span className="muted">Round {currentRound}</span>}
          </div>
        </div>

        <div className="chamber-actions">
          {running ? (
            <>
              <button
                className="sm primary"
                onClick={handleConclude}
                disabled={actionBusy}
                title="Finish and synthesize"
              >
                End & synthesize
              </button>
              <button className="sm" onClick={() => handleExtend(1)} disabled={actionBusy}>
                +1 round
              </button>
              <button className="sm danger" onClick={handleCancel} disabled={actionBusy}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="sm" onClick={handleRerun} disabled={actionBusy}>
                Re-run
              </button>
              <Link className="btn sm primary" href={`/?topic=${encodeURIComponent(session.topic)}`}>
                Edit & convene
              </Link>
            </>
          )}
        </div>
      </div>

      {actionNotice && <div className="notice">{actionNotice}</div>}
      {error && <p className="form-error">Error: {error}</p>}

      <div className="member-rail">
        {Object.entries(memberStatus).map(([id, st]) => (
          <div key={id} className="member-pill" title={`${memberNames[id] ?? id}: ${STATUS_LABEL[st]}`}>
            <span className={`status-dot ${st}`} />
            <span>{memberNames[id] ?? id}</span>
            {st === 'thinking' || st === 'streaming' ? (
              <span className="member-pill-status">{STATUS_LABEL[st]}</span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="chat-thread">
        {synthesis && (
          <div className="synthesis-card">
            <div className="synthesis-kicker">Council synthesis</div>
            <div className="message-content">
              <MarkdownRenderer content={synthesis.content} />
            </div>
            <MessageMeta m={synthesis} />
          </div>
        )}

        {rounds.map((round) => (
          <div key={round}>
            <div className="round-label">{round === 0 ? 'Question & research' : `Round ${round}`}</div>
            {discussion
              .filter((m) => m.round === round)
              .map((m) => {
                const isWeb = m.memberName === 'Web Search'
                const isUser = m.kind === 'user'
                const color = isWeb
                  ? '#7dd3fc'
                  : isUser
                    ? 'var(--text)'
                    : memberColors[m.memberId || ''] || 'var(--text-secondary)'
                const initials = isWeb ? 'W' : isUser ? 'Y' : (m.memberName || '??').slice(0, 2).toUpperCase()

                return (
                  <div key={m.id} className={`message-bubble ${isUser ? 'user' : ''} ${isWeb ? 'web' : ''}`}>
                    <div
                      className="avatar"
                      style={{
                        background: isWeb ? 'rgba(125, 211, 252, 0.12)' : isUser ? '#262626' : color,
                        color: isWeb ? '#7dd3fc' : '#fff',
                      }}
                    >
                      {initials}
                    </div>
                    <div className="message-body">
                      <div className="message-header">
                        <span className="message-sender" style={{ color: isUser ? 'var(--text)' : color }}>
                          {isUser ? 'You' : m.memberName || 'Member'}
                        </span>
                        <MessageMeta m={m} />
                      </div>
                      <div className="message-content">
                        <MarkdownRenderer content={m.content} />
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        ))}

        {running && (
          <div className="typing-indicator">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span>Council is deliberating…</span>
          </div>
        )}

        {!running && !synthesis && session.status === 'completed' && (
          <p className="muted" style={{ padding: '8px 0 16px' }}>
            Session complete. No moderator synthesis was configured.
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {running && (
        <div className="composer-dock">
          <div className="chat-input-box">
            <textarea
              placeholder="Steer the council…"
              value={interventionText}
              onChange={(e) => setInterventionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleIntervene()
                }
              }}
              rows={1}
              disabled={actionBusy}
            />
            <button
              className="send-btn"
              onClick={handleIntervene}
              disabled={actionBusy || !interventionText.trim()}
              title="Send directive"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <p className="composer-hint">Injected into the live debate. Enter to send.</p>
        </div>
      )}

      <div className="usage-bar">
        <div className="usage-item">
          <span>Calls</span>
          <span className="usage-value">{liveUsage.calls}</span>
        </div>
        <div className="usage-item">
          <span>Tokens</span>
          <span className="usage-value">{liveUsage.tokens.toLocaleString()}</span>
        </div>
        <div className="usage-item">
          <span>Cost</span>
          <span className="usage-value">{liveUsage.costUsd > 0 ? `$${liveUsage.costUsd.toFixed(4)}` : '$0'}</span>
        </div>
        <div className="usage-item">
          <span>Messages</span>
          <span className="usage-value">{messages.length}</span>
        </div>
      </div>
    </div>
  )
}

function MessageMeta({ m }: { m: MessageDTO }) {
  const u = m.usage
  if (!u || (u.promptTokens == null && u.latencyMs == null)) return null
  return (
    <span className="message-meta">
      {u.totalTokens != null ? `${u.totalTokens.toLocaleString()} tok` : ''}
      {u.costUsd != null && u.costUsd > 0 ? ` · $${u.costUsd.toFixed(4)}` : ''}
      {u.latencyMs != null ? ` · ${(u.latencyMs / 1000).toFixed(1)}s` : ''}
    </span>
  )
}
