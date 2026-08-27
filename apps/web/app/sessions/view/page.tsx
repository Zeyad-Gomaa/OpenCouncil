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
  const [liveUsage, setLiveUsage] = useState<LiveUsage>({ calls: 0, tokens: 0, costUsd: 0 })
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const mergeMessage = useCallback((m: MessageDTO) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setError('No session id in URL — open a chamber via /sessions/view/?id=<sessionId>')
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

        // Seed member rail from council roster
        try {
          const council = await apiGet<{ members: { id: string; name: string }[] }>(
            `/councils/${snap.session.councilId}`,
          )
          if (!cancelled) {
            const st: Record<string, MemberLiveStatus> = {}
            const names: Record<string, string> = {}
            for (const mem of council.members) {
              st[mem.id] = 'queued'
              names[mem.id] = mem.name
            }
            setMemberStatus(st)
            setMemberNames(names)
          }
        } catch {
          /* council may be gone; rail optional */
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

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Live session</p>
          <h1 style={{ flex: 1 }}>Deliberation</h1>
        </div>
        {running && (
          <button className="danger" onClick={cancel}>
            Cancel session
          </button>
        )}
      </div>
      <p className="subtitle">
        {session ? (
          <>
            Council: <strong>{session.councilName}</strong> · Status:{' '}
            <span className={`badge ${session.status}`}>{session.status}</span>
          </>
        ) : (
          'Loading…'
        )}
      </p>

      {error && <p style={{ color: 'var(--danger)' }}>Error: {error}</p>}

      {/* Member rail */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {Object.entries(memberStatus).map(([id, st]) => (
          <div key={id} className="stat-card" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className="dot"
                data-status={st}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background:
                    st === 'thinking' || st === 'streaming'
                      ? 'var(--brass)'
                      : st === 'completed'
                        ? 'var(--ok)'
                        : st === 'failed'
                          ? 'var(--danger)'
                          : 'var(--text-faint)',
                }}
              />
              <span style={{ fontSize: '0.92rem' }}>{memberNames[id] ?? id}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: 3 }}>{STATUS_LABEL[st]}</div>
          </div>
        ))}
      </div>

      {/* Synthesis pinned */}
      {synthesis && (
        <div
          className="card"
          style={{
            borderColor: 'var(--brass)',
            background: 'linear-gradient(180deg, rgba(201,162,39,0.07), transparent)',
          }}
        >
          <h2 style={{ margin: '0 0 10px' }}>⚖ Synthesis — the council&apos;s answer</h2>
          <TranscriptBody content={synthesis.content} />
          <MessageMeta m={synthesis} />
        </div>
      )}

      {/* Transcript by round */}
      {rounds.map((round) => (
        <div key={round}>
          <h2>{round === 0 ? 'The Question' : `Round ${round}`}</h2>
          {[...discussion.filter((m) => m.round === round)].map((m) => (
            <div
              key={m.id}
              className="card"
              style={m.kind === 'user' ? { borderLeft: '3px solid var(--accent-blue)' } : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ color: m.kind === 'user' ? 'var(--accent-blue)' : 'var(--brass)' }}>
                  {m.memberName}
                </strong>
                <MessageMeta m={m} />
              </div>
              <TranscriptBody content={m.content} />
            </div>
          ))}
        </div>
      ))}

      {running && <p style={{ color: 'var(--text-faint)' }}>The council is deliberating…</p>}
      {!running && !synthesis && session?.status === 'completed' && (
        <p style={{ color: 'var(--text-faint)' }}>
          Session complete. No moderator synthesis was configured for this council.
        </p>
      )}

      {/* Usage footer */}
      <div className="stat-row" style={{ marginTop: 26 }}>
        <StatCard label="LLM calls" value={String(liveUsage.calls)} />
        <StatCard label="Total tokens" value={liveUsage.tokens.toLocaleString()} />
        <StatCard label="Estimated cost" value={liveUsage.costUsd > 0 ? `$${liveUsage.costUsd.toFixed(4)}` : '$0'} />
        <StatCard label="Messages" value={String(messages.length)} />
      </div>

      <div ref={bottomRef} />
      <p style={{ marginTop: 20 }}>
        <Link href="/sessions">← All sessions</Link>
      </p>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="num">{value}</div>
      <div className="lbl">{label}</div>
    </div>
  )
}

function MessageMeta({ m }: { m: MessageDTO }) {
  const u = m.usage
  if (!u || (u.promptTokens == null && u.latencyMs == null)) return null
  return (
    <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
      {u.totalTokens != null ? `${u.totalTokens.toLocaleString()} tok · ` : ''}
      {u.costUsd != null && u.costUsd > 0 ? `$${u.costUsd.toFixed(4)} · ` : ''}
      {u.latencyMs != null ? `${(u.latencyMs / 1000).toFixed(1)}s` : ''}
    </span>
  )
}

function TranscriptBody({ content }: { content: string }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: '0.95rem' }}>{content.replace(/\*\*/g, '')}</div>
  )
}
