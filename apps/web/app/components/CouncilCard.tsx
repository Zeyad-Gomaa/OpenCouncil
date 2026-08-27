'use client'

import type { CouncilDTO } from '@opencouncil/shared'

interface CouncilCardProps {
  council: CouncilDTO
  onDelete: (id: string) => void
  onEdit: (council: CouncilDTO) => void
}

export default function CouncilCard({ council, onDelete, onEdit }: CouncilCardProps) {
  const moderator = council.moderatorMemberId ? council.members.find((m) => m.id === council.moderatorMemberId) : null

  return (
    <div className="council-card">
      <div className="council-card-header">
        <div>
          <div className="council-name">{council.name}</div>
          {council.description && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4 }}>
              {council.description.length > 120 ? council.description.slice(0, 120) + '…' : council.description}
            </div>
          )}
        </div>
      </div>

      <div className="council-meta">
        <span className="protocol-badge">{council.strategy === 'debate' ? '⚔ Debate' : '↻ Round Robin'}</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {council.rounds} {council.rounds === 1 ? 'round' : 'rounds'}
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {council.members.length} {council.members.length === 1 ? 'member' : 'members'}
        </span>
        {moderator && <span style={{ fontSize: '0.72rem', color: 'var(--gold)' }}>👑 {moderator.name}</span>}
      </div>

      {council.members.length > 0 && (
        <div className="avatar-row" style={{ marginTop: 12 }}>
          {council.members.map((m) => (
            <div key={m.id} className="avatar sm" style={{ background: m.avatarColor || '#818cf8' }} title={m.name}>
              {m.name.slice(0, 2).toUpperCase()}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
        <button className="sm" onClick={() => onEdit(council)}>
          Edit
        </button>
        <button className="sm danger" onClick={() => onDelete(council.id)}>
          Delete
        </button>
      </div>
    </div>
  )
}
