'use client'

import type { MemberDTO } from '@opencouncil/shared'

interface MemberCardProps {
  member: MemberDTO
  onDelete: (id: string) => void
  onEdit: (member: MemberDTO) => void
}

export default function MemberCard({ member, onDelete, onEdit }: MemberCardProps) {
  const initials = member.name.slice(0, 2).toUpperCase()

  return (
    <div className="member-card">
      <div className="member-card-header">
        <div className="avatar" style={{ background: member.avatarColor || '#818cf8' }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="member-name">{member.name}</div>
          <div className="member-model">
            {member.modelName || 'No model'}
            {member.providerName ? ` · ${member.providerName}` : ''}
          </div>
        </div>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            color: member.enabled ? 'var(--success)' : 'var(--text-quaternary)',
          }}
        >
          {member.enabled ? '●' : '○'}
        </span>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2, marginLeft: 44 }}>
        Temperature: {member.temperature}
        {member.maxTokens ? ` · Max tokens: ${member.maxTokens.toLocaleString()}` : ''}
      </div>
      {member.systemPrompt && <div className="member-prompt">{member.systemPrompt}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button className="sm" onClick={() => onEdit(member)}>
          Edit
        </button>
        <button className="sm danger" onClick={() => onDelete(member.id)}>
          Delete
        </button>
      </div>
    </div>
  )
}
