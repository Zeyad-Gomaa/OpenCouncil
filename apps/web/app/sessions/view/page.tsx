'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { apiGet, apiSend } from '../../lib/api'
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
  queued: 'awaiting',
  thinking: 'deliberating…',
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
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('id')

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [messages, setMessages] = useState<MessageDTO[]>([])
  const [memberStatus, setMemberStatus] = useState<Record<string, MemberLiveStatus>>({})
  const [memberNames, setMemberNames] = useState<Record<string, string>>({})
  const [memberColors, setMemberColors] = useState<Record<string, string>>({})
  const [liveUsage, setLiveUsage] = useState<LiveUsage>({ calls: 0, tokens: 0, costUsd: 0 })
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const mergeMessage = useCallback((m: MessageDTO) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setError('No session id in URL')
      return
    }
    let es: EventSource | null = null
    let cancelled = false

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
              colors[mem.id] = mem.avatarColor || '#818cf8'
            }
            setMemberStatus(st)
            setMemberNames(names)
            setMemberColors(colors)
          }
        } catch {
          /* council may be deleted */
        }

        if (['completed', 'failed', 'cancelled'].includes(snap.session.status)) return

        es = new EventSource(`/api/v1/sessions/${sessionId}/events?after=${snap.lastEventSequence}`)
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
              break
            case 'session.failed':
              setError(event.error)
              setSnapshot((s) => s && { ...s, session: { ...s.session, status: 'failed' } })
              break
            case 'session.cancelled':
              setSnapshot((s) => s && { ...s, session: { ...s.session, status: 'cancelled' } })
              break
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    void boot()
    return () => {
      cancelled = true
      es?.close()
    }
  }, [sessionId, mergeMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  async function cancel() {
    try {
      await apiSend(`/sessions/${sessionId}/cancel`, 'POST')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const session = snapshot?.session
  const synthesis = [...messages].reverse().find((m) => m.kind === 'synthesis')
  const discussion = messages.filter((m) => m.kind !== 'synthesis')
  const running = session?.status === 'running' || session?.status === 'queued'
  const rounds = [...new Set(discussion.map((m) => m.round))].sort((a, b) => a - b)

  if (!session) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <div className="skeleton" style={{ width: 300, height: 24, margin: '0 auto 12px' }} />
        <div className="skeleton" style={{ width: 200, height: 16, margin: '0 auto' }} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="chamber-header">
        <div>
          <p className="eyebrow">Live session</p>
          <h1 style={{ margin: 0 }}>{session.councilName || 'Deliberation'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span className={`badge ${session.status}`}>{session.status}</span>
            {session.topic && (
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                {session.topic.length > 100 ? session.topic.slice(0, 100) + '…' : session.topic}
              </span>
            )}
          </div>
        </div>
        {running && (
          <button className="danger" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>Error: {error}</p>}

      {/* Member rail */}
      <div className="member-rail">
        {Object.entries(memberStatus).map(([id, st]) => (
          <div key={id} className="member-pill" title={`${memberNames[id] ?? id}: ${STATUS_LABEL[st]}`}>
            <span className={`status-dot ${st}`} />
            <span>{memberNames[id] ?? id}</span>
            {st === 'thinking' || st === 'streaming' ? (
              <span style={{ fontSize: '0.7rem', color: 'var(--warning)', marginLeft: 4 }}>
                {STATUS_LABEL[st]}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Synthesis pinned */}
      {synthesis && (
        <div className="synthesis-card">
          <h3>⚖ Council Synthesis</h3>
          <div className="message-content">{synthesis.content}</div>
          <MessageMeta m={synthesis} />
        </div>
      )}

      {/* Transcript by round */}
      {rounds.map((round) => (
        <div key={round}>
          <h2>{round === 0 ? 'The Question' : `Round ${round}`}</h2>
          {discussion
            .filter((m) => m.round === round)
            .map((m) => {
              const color =
                m.kind === 'user'
                  ? 'var(--accent)'
                  : memberColors[m.memberId || ''] || 'var(--text-secondary)'
              const initials = (m.memberName || '??').slice(0, 2).toUpperCase()

              return (
                <div key={m.id} className="message-bubble">
                  <div className="avatar" style={{ background: color }}>
                    {initials}
                  </div>
                  <div className="message-body">
                    <div className="message-header">
                      <span className="message-sender" style={{ color }}>
                        {m.memberName || 'User'}
                      </span>
                      <MessageMeta m={m} />
                    </div>
                    <div className="message-content">{m.content}</div>
                  </div>
                </div>
              )
            })}
        </div>
      ))}

      {/* Typing indicator */}
      {running && (
        <div className="typing-indicator">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
          <span style={{ marginLeft: 8, fontSize: '0.82rem' }}>Council is deliberating…</span>
        </div>
      )}

      {!running && !synthesis && session.status === 'completed' && (
        <p className="muted" style={{ padding: '16px 0' }}>
          Session complete. No moderator synthesis was configured.
        </p>
      )}

      {/* Usage footer */}
      <div className="usage-bar">
        <div className="usage-item">
          <span>LLM calls</span>
          <span className="usage-value">{liveUsage.calls}</span>
        </div>
        <div className="usage-item">
          <span>Tokens</span>
          <span className="usage-value">{liveUsage.tokens.toLocaleString()}</span>
        </div>
        <div className="usage-item">
          <span>Cost</span>
          <span className="usage-value">
            {liveUsage.costUsd > 0 ? `$${liveUsage.costUsd.toFixed(4)}` : '$0'}
          </span>
        </div>
        <div className="usage-item">
          <span>Messages</span>
          <span className="usage-value">{messages.length}</span>
        </div>
      </div>

      <div ref={bottomRef} />
      <p style={{ marginTop: 20 }}>
        <Link href="/sessions">← All sessions</Link>
      </p>
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
