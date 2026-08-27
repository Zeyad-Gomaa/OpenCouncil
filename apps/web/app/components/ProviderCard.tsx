'use client'

import type { ProviderDTO } from '@opencouncil/shared'

interface ProviderCardProps {
  provider: ProviderDTO
  onDelete: (id: string) => void
  onTest: (id: string) => void
  onEdit?: (provider: ProviderDTO) => void
}

function getProviderIcon(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('openai')) return '✦'
  if (n.includes('anthropic')) return '◈'
  if (n.includes('google') || n.includes('gemini')) return '◆'
  if (n.includes('groq')) return '⚡'
  if (n.includes('ollama')) return '🦙'
  if (n.includes('openrouter')) return '⊕'
  if (n.includes('together')) return '⊞'
  if (n.includes('mistral')) return '◇'
  if (n.includes('deepseek')) return '◎'
  if (n.includes('xai') || n.includes('grok')) return '𝕏'
  if (n.includes('lmstudio') || n.includes('lm studio')) return '⬡'
  return '⬢'
}

export default function ProviderCard({ provider, onDelete, onTest, onEdit }: ProviderCardProps) {
  function handleDelete() {
    if (window.confirm(`Delete "${provider.name}" and all its models? Members using them will be disabled.`)) {
      onDelete(provider.id)
    }
  }

  return (
    <div className="provider-card">
      <div className="provider-card-header">
        <div className="provider-icon">{getProviderIcon(provider.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: '0.95rem' }}>{provider.name}</strong>
            <span className="protocol-badge">{provider.protocol.replace('_compatible', '')}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
            {provider.baseUrl || '(protocol default)'}
          </div>
        </div>
      </div>
      <div className="provider-card-meta">
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {provider.hasApiKey ? '🔒 Key stored' : '— No key'}
        </span>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            color: provider.enabled ? 'var(--success)' : 'var(--text-quaternary)',
          }}
        >
          {provider.enabled ? '● Active' : '○ Disabled'}
        </span>
      </div>
      <div className="provider-card-actions">
        <button className="sm" onClick={() => onTest(provider.id)}>
          Test
        </button>
        {onEdit && (
          <button className="sm" onClick={() => onEdit(provider)}>
            Edit
          </button>
        )}
        <button className="sm danger" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
