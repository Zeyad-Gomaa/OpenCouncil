'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import type { ActivityStats, GroupedUsage } from '@opencouncil/shared'

interface StatsResponse extends ActivityStats {
  recentLog: { id: number; action: string; detail: string | null; created_at: string }[]
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ActivityPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<StatsResponse>('/activity/stats?days=30')
      .then(setStats)
      .catch((e) => setError(String(e)))
  }, [])

  if (error) {
    return (
      <div>
        <h1>Activity</h1>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 220, height: 28, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 340, height: 16 }} />
          </div>
        </div>
        <div className="stat-row">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="stat-card skeleton" style={{ height: 72 }} />
          ))}
        </div>
      </div>
    )
  }

  const maxDaily = Math.max(...stats.daily.map((d) => d.tokens), 1)

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Observability</p>
          <h1>Usage & Activity</h1>
          <p className="subtitle">Every token metered, every action logged — last 30 days.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <Stat label="Sessions" value={String(stats.totals.sessions)} icon="◷" />
        <Stat label="Messages" value={String(stats.totals.messages)} icon="◈" />
        <Stat label="Prompt Tokens" value={stats.totals.promptTokens.toLocaleString()} icon="→" />
        <Stat label="Completion Tokens" value={stats.totals.completionTokens.toLocaleString()} icon="←" />
        <Stat
          label="Est. Spend"
          value={stats.totals.costUsd && stats.totals.costUsd > 0 ? `$${stats.totals.costUsd.toFixed(4)}` : '$0'}
          icon="$"
        />
        <Stat label="Errors" value={String(stats.totals.errors)} icon="⚠" />
      </div>

      {/* Daily chart */}
      <h2>Daily token usage</h2>
      <div className="card">
        {stats.daily.length === 0 ? (
          <p className="muted">No usage in the window.</p>
        ) : (
          <div className="bar-chart" title="Tokens per day">
            {stats.daily.map((d) => (
              <div
                key={d.day}
                className="bar"
                style={{ height: `${Math.max((d.tokens / maxDaily) * 100, 3)}%` }}
                title={`${d.day}: ${d.tokens.toLocaleString()} tokens`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Breakdowns */}
      <div className="grid-2">
        <Breakdown title="By Member" rows={stats.byMember} />
        <Breakdown title="By Model" rows={stats.byModel} />
      </div>
      <Breakdown title="By Provider" rows={stats.byProvider} />

      {/* Activity log */}
      <h2>Activity Log</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentLog.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  Nothing logged yet.
                </td>
              </tr>
            )}
            {stats.recentLog.map((e) => (
              <tr key={e.id}>
                <td style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                  {timeAgo(e.created_at)}
                </td>
                <td>
                  {e.action}
                  {e.detail ? <span className="muted"> — {e.detail.slice(0, 120)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="stat-card">
      <div className="num">{value}</div>
      <div className="lbl">
        <span style={{ marginRight: 4, opacity: 0.5 }}>{icon}</span>
        {label}
      </div>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: GroupedUsage[] }) {
  const maxTok = Math.max(...rows.map((r) => r.tokens), 1)
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 10px' }}>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">No data.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Tokens</th>
              <th>Calls</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: `${(r.tokens / maxTok) * 60 + 16}px`,
                      height: 8,
                      background: 'linear-gradient(90deg, var(--accent-dim), var(--accent))',
                      borderRadius: 3,
                      marginRight: 8,
                      opacity: 0.6,
                      verticalAlign: 'middle',
                    }}
                  />
                  {r.tokens.toLocaleString()}
                </td>
                <td>{r.messages}</td>
                <td>{r.costUsd && r.costUsd > 0 ? `$${r.costUsd.toFixed(4)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
