'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import type { ActivityStats, GroupedUsage } from '@opencouncil/shared'

interface StatsResponse extends ActivityStats {
  recentLog: { id: number; action: string; detail: string | null; created_at: string }[]
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
        <h1>Activity</h1>
        <p className="subtitle">Loading…</p>
      </div>
    )
  }

  const maxDaily = Math.max(...stats.daily.map((d) => d.tokens), 1)

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Observability</p>
          <h1>Usage & activity</h1>
          <p className="subtitle">Usage across the last 30 days — every token metered, every action logged.</p>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Sessions" value={String(stats.totals.sessions)} />
        <Stat label="Messages" value={String(stats.totals.messages)} />
        <Stat label="Prompt tokens" value={stats.totals.promptTokens.toLocaleString()} />
        <Stat label="Completion tokens" value={stats.totals.completionTokens.toLocaleString()} />
        <Stat
          label="Est. spend"
          value={stats.totals.costUsd && stats.totals.costUsd > 0 ? `$${stats.totals.costUsd.toFixed(4)}` : '$0'}
        />
        <Stat label="Errors" value={String(stats.totals.errors)} />
      </div>

      <h2>Daily tokens</h2>
      <div className="card">
        {stats.daily.length === 0 ? (
          <p style={{ color: 'var(--text-faint)' }}>No usage in the window.</p>
        ) : (
          <div className="bar-chart" title="tokens per day">
            {stats.daily.map((d) => (
              <div
                key={d.day}
                className="bar"
                style={{ height: `${Math.max((d.tokens / maxDaily) * 100, 2)}%` }}
                title={`${d.day}: ${d.tokens.toLocaleString()} tokens`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <Breakdown title="By member" rows={stats.byMember} />
        <Breakdown title="By model" rows={stats.byModel} />
      </div>
      <Breakdown title="By provider" rows={stats.byProvider} />

      <h2>Activity log</h2>
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
                <td colSpan={2} style={{ color: 'var(--text-faint)' }}>
                  Nothing logged yet.
                </td>
              </tr>
            )}
            {stats.recentLog.map((e) => (
              <tr key={e.id}>
                <td style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td>
                  {e.action}
                  {e.detail ? <span style={{ color: 'var(--text-faint)' }}> — {e.detail.slice(0, 120)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="num">{value}</div>
      <div className="lbl">{label}</div>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: GroupedUsage[] }) {
  const maxTok = Math.max(...rows.map((r) => r.tokens), 1)
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 10px' }}>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-faint)' }}>No data.</p>
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
                <td>{r.name}</td>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: `${(r.tokens / maxTok) * 60 + 20}px`,
                      background: 'var(--brass)',
                      opacity: 0.5,
                      height: 10,
                      borderRadius: 3,
                      marginRight: 8,
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
