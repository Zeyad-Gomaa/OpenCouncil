'use client'

import type { ModelDTO } from '@opencouncil/shared'

interface ModelCardProps {
  model: ModelDTO
  providerName?: string
  onDelete: (id: string) => void
}

function formatContext(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(n)
}

function formatPrice(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n === 0) return '$0'
  return `$${n.toFixed(2)}`
}

export default function ModelCard({ model, providerName, onDelete }: ModelCardProps) {
  const maxContext = 200_000
  const contextPct = model.contextWindow ? Math.min((model.contextWindow / maxContext) * 100, 100) : 0

  return (
    <div className="model-card">
      <div className="model-card-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="model-name">{model.displayName}</div>
          <div className="model-id">{model.modelId}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {providerName && <span className="protocol-badge">{providerName}</span>}
          <button
            className="ghost sm"
            onClick={() => onDelete(model.id)}
            title="Delete model"
            style={{ padding: '4px 6px', minHeight: 'unset' }}
          >
            ✕
          </button>
        </div>
      </div>

      {model.contextWindow != null && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.72rem',
              color: 'var(--text-tertiary)',
              marginBottom: 4,
            }}
          >
            <span>Context window</span>
            <span style={{ fontWeight: 600 }}>{formatContext(model.contextWindow)}</span>
          </div>
          <div className="context-bar">
            <div className="context-bar-fill" style={{ width: `${contextPct}%` }} />
          </div>
        </div>
      )}

      <div className="model-pricing">
        <div className="price-item">
          <span className="price-label">Input / 1M</span>
          <span className="price-value">{formatPrice(model.inputPerMTokUsd)}</span>
        </div>
        <div className="price-item">
          <span className="price-label">Output / 1M</span>
          <span className="price-value">{formatPrice(model.outputPerMTokUsd)}</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: model.enabled ? 'var(--success)' : 'var(--text-quaternary)',
            }}
          >
            {model.enabled ? '● Active' : '○ Disabled'}
          </span>
        </div>
      </div>
    </div>
  )
}
