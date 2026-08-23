'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import type { CouncilDTO, MemberDTO, ModelDTO, ProviderDTO, StrategyKind } from '@opencouncil/shared'

interface Preset {
  key: string
  protocol: string
  baseUrl?: string
}

type Tab = 'providers' | 'models' | 'members' | 'councils'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('providers')

  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Administration</p><h1>Configuration</h1><p className="subtitle">Manage providers, models, members, and council protocols.</p></div></div>

      <div className="tabs">
        {(['providers', 'models', 'members', 'councils'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'providers' && <ProvidersTab />}
      {tab === 'models' && <ModelsTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'councils' && <CouncilsTab />}
    </div>
  )
}

/* ---------------- Providers ---------------- */

function ProvidersTab() {
  const [providers, setProviders] = useState<ProviderDTO[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [name, setName] = useState('')
  const [protocol, setProtocol] = useState('openai_compatible')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<ProviderDTO[]>('/providers').then(setProviders).catch((e) => setError(String(e)))
    apiGet<{ presets: Preset[] }>('/meta/providers').then((m) => setPresets(m.presets)).catch(() => {})
  }, [])

  useEffect(load, [load])

  async function add() {
    setError(null)
    try {
      await apiSend('/providers', 'POST', {
        name,
        protocol,
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
      })
      setName(''); setApiKey('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete provider and its models? Members using them will be disabled.')) return
    await apiSend(`/providers/${id}`, 'DELETE')
    load()
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add a provider (BYOK)</h2>
        <label>Preset</label>
        <select
          onChange={(e) => {
            const p = presets.find((x) => x.key === e.target.value)
            if (p) {
              setProtocol(p.protocol)
              setBaseUrl(p.baseUrl ?? '')
              setName(p.key.charAt(0).toUpperCase() + p.key.slice(1))
            }
          }}
          defaultValue=""
        >
          <option value="" disabled>Choose a preset…</option>
          {presets.map((p) => (
            <option key={p.key} value={p.key}>{p.key}</option>
          ))}
        </select>

        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI" />
        <label>Protocol</label>
        <select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
          <option value="openai_compatible">OpenAI-compatible</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google Gemini</option>
          <option value="mock">Mock</option>
        </select>
        <label>Base URL (leave empty for protocol default)</label>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
        <label>API key (encrypted at rest)</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <div style={{ marginTop: 14 }}>
          <button className="primary" onClick={add} disabled={!name}>Add provider</button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Protocol</th><th>Base URL</th><th>Key</th><th></th></tr></thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.protocol}</td>
                <td style={{ color: 'var(--text-faint)' }}>{p.baseUrl ?? '(default)'}</td>
                <td>{p.hasApiKey ? '🔒 stored' : '—'}</td>
                <td><button className="danger" onClick={() => remove(p.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Models ---------------- */

function ModelsTab() {
  const [providers, setProviders] = useState<ProviderDTO[]>([])
  const [models, setModels] = useState<ModelDTO[]>([])
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [ctx, setCtx] = useState('128000')
  const [inPrice, setInPrice] = useState('')
  const [outPrice, setOutPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<ProviderDTO[]>('/providers').then((ps) => {
      setProviders(ps.filter((p) => p.enabled))
      if (ps.length > 0 && !providerId) setProviderId(ps[0]!.id)
    }).catch((e) => setError(String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    apiGet<ModelDTO[]>('/models').then(setModels).catch(() => {})
  }, [])

  async function add() {
    setError(null)
    try {
      await apiSend('/models', 'POST', {
        providerId,
        modelId,
        displayName: displayName || modelId,
        contextWindow: ctx ? Number(ctx) : null,
        inputPerMTokUsd: inPrice ? Number(inPrice) : null,
        outputPerMTokUsd: outPrice ? Number(outPrice) : null,
      })
      setModelId(''); setDisplayName('')
      apiGet<ModelDTO[]>('/models').then(setModels)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(id: string) {
    await apiSend(`/models/${id}`, 'DELETE')
    apiGet<ModelDTO[]>('/models').then(setModels)
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Enroll a model</h2>
        <label>Provider</label>
        <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label>Model ID (as the API expects it)</label>
        <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4o" />
        <label>Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="GPT-4o" />
        <div className="grid-2">
          <div>
            <label>Context window</label>
            <input value={ctx} onChange={(e) => setCtx(e.target.value)} />
          </div>
          <div>
            <label>$/M tokens in / out (optional)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={inPrice} onChange={(e) => setInPrice(e.target.value)} placeholder="2.50" />
              <input value={outPrice} onChange={(e) => setOutPrice(e.target.value)} placeholder="10.00" />
            </div>
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <div style={{ marginTop: 14 }}>
          <button className="primary" onClick={add} disabled={!providerId || !modelId}>Enroll model</button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Display</th><th>Model ID</th><th>Context</th><th></th></tr></thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td>{m.displayName}</td>
                <td style={{ color: 'var(--text-faint)' }}>{m.modelId}</td>
                <td>{m.contextWindow ? m.contextWindow.toLocaleString() : '—'}</td>
                <td><button className="danger" onClick={() => remove(m.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Members ---------------- */

const COLORS = ['#c9a227', '#4f86c6', '#a0522d', '#557a46', '#8e5ea2', '#b0413e']

function MembersTab() {
  const [members, setMembers] = useState<MemberDTO[]>([])
  const [models, setModels] = useState<ModelDTO[]>([])
  const [name, setName] = useState('')
  const [modelId, setModelId] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState('0.7')
  const [color, setColor] = useState(COLORS[0]!)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<MemberDTO[]>('/members').then(setMembers).catch((e) => setError(String(e)))
    apiGet<ModelDTO[]>('/models').then(setModels).catch(() => {})
  }, [])
  useEffect(load, [load])

  async function add() {
    setError(null)
    try {
      await apiSend('/members', 'POST', {
        name,
        modelId,
        systemPrompt: systemPrompt || null,
        temperature: Number(temperature),
        avatarColor: color,
      })
      setName(''); setSystemPrompt('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(id: string) {
    await apiSend(`/members/${id}`, 'DELETE')
    load()
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Mint a member — a council seat bound to a model</h2>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Strategist" />
        <label>Model</label>
        <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
          <option value="" disabled>Choose…</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.displayName} ({m.modelId})</option>)}
        </select>
        <label>Persona system prompt</label>
        <textarea rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are The Strategist — you think in tradeoffs, second-order effects, and game theory…" />
        <div className="grid-2">
          <div>
            <label>Temperature ({temperature})</label>
            <input type="range" min="0" max="2" step="0.1" value={temperature}
              onChange={(e) => setTemperature(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label>Color</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    background: c, width: 30, height: 30, borderRadius: 6,
                    outline: color === c ? '2px solid var(--text)' : 'none',
                    border: 'none', cursor: 'pointer',
                  }}
                  aria-label={`color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <div style={{ marginTop: 14 }}>
          <button className="primary" onClick={add} disabled={!name || !modelId}>Mint member</button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Member</th><th>Model</th><th>Provider</th><th>Temp</th><th></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td><span style={{ color: m.avatarColor }}>●</span> {m.name}</td>
                <td>{m.modelName ?? '—'}</td>
                <td style={{ color: 'var(--text-faint)' }}>{m.providerName ?? '—'}</td>
                <td>{m.temperature}</td>
                <td><button className="danger" onClick={() => remove(m.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Councils ---------------- */

function CouncilsTab() {
  const [councils, setCouncils] = useState<CouncilDTO[]>([])
  const [members, setMembers] = useState<MemberDTO[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [strategy, setStrategy] = useState<StrategyKind>('debate')
  const [rounds, setRounds] = useState(2)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moderatorId, setModeratorId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<CouncilDTO[]>('/councils').then(setCouncils).catch((e) => setError(String(e)))
    apiGet<MemberDTO[]>('/members').then(setMembers).catch(() => {})
  }, [])
  useEffect(load, [load])

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function add() {
    setError(null)
    try {
      await apiSend('/councils', 'POST', {
        name,
        description: description || null,
        strategy,
        rounds,
        memberIds: [...selected],
        moderatorMemberId: moderatorId || null,
      })
      setName(''); setDescription(''); setSelected(new Set()); setModeratorId('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(id: string) {
    if (!confirm('Dissolve council? Session history is kept.')) return
    await apiSend(`/councils/${id}`, 'DELETE')
    load()
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Constitute a council</h2>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="War Council" />
        <label>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Architecture decisions" />

        <label>Strategy</label>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyKind)}>
          <option value="debate">Debate — members see the transcript and rebut each other</option>
          <option value="round_robin">Round-robin — independent positions each round</option>
        </select>

        <label>Rounds ({rounds})</label>
        <input type="range" min="1" max="5" step="1" value={rounds} onChange={(e) => setRounds(Number(e.target.value))} />

        <label>Members (click to toggle)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={selected.has(m.id) ? 'primary' : ''}
              style={{ opacity: selected.has(m.id) ? 1 : 0.7 }}
            >
              {m.name}
            </button>
          ))}
        </div>

        <label>Moderator (writes the final synthesis; optional)</label>
        <select value={moderatorId} onChange={(e) => setModeratorId(e.target.value)}>
          <option value="">None — raw transcript only</option>
          {[...selected].map((id) => {
            const mem = members.find((x) => x.id === id)
            return mem ? <option key={id} value={id}>{mem.name}</option> : null
          })}
        </select>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <div style={{ marginTop: 14 }}>
          <button className="primary" onClick={add} disabled={!name || selected.size === 0}>Constitute council</button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Council</th><th>Strategy</th><th>Rounds</th><th>Members</th><th>Moderator</th><th></th></tr></thead>
          <tbody>
            {councils.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.strategy}</td>
                <td>{c.rounds}</td>
                <td>{c.members.map((m) => m.name).join(', ')}</td>
                <td style={{ color: 'var(--brass)' }}>
                  {c.members.find((m) => m.id === c.moderatorMemberId)?.name ?? '—'}
                </td>
                <td><button className="danger" onClick={() => remove(c.id)}>Dissolve</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
