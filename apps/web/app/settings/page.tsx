'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiSend } from '../lib/api'
import Modal from '../components/Modal'
import ProviderCard from '../components/ProviderCard'
import ModelCard from '../components/ModelCard'
import MemberCard from '../components/MemberCard'
import CouncilCard from '../components/CouncilCard'
import SearchFilter from '../components/SearchFilter'
import CatalogPicker from '../components/CatalogPicker'
import type {
  ProviderProtocol,
  ProviderDTO,
  ModelDTO,
  MemberDTO,
  StrategyKind,
  CouncilDTO,
  CatalogModel,
  ProviderCatalogDTO,
} from '@opencouncil/shared'

const COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f87171', '#60a5fa', '#a78bfa']

type Tab = 'providers' | 'models' | 'members' | 'councils'

interface Preset {
  key: string
  protocol: string
  baseUrl?: string
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('providers')
  const [providers, setProviders] = useState<ProviderDTO[]>([])
  const [models, setModels] = useState<ModelDTO[]>([])
  const [members, setMembers] = useState<MemberDTO[]>([])
  const [councils, setCouncils] = useState<CouncilDTO[]>([])

  const loadProviders = useCallback(() => {
    apiGet<ProviderDTO[]>('/providers')
      .then(setProviders)
      .catch(() => {})
  }, [])
  const loadModels = useCallback(() => {
    apiGet<ModelDTO[]>('/models')
      .then(setModels)
      .catch(() => {})
  }, [])
  const loadMembers = useCallback(() => {
    apiGet<MemberDTO[]>('/members')
      .then(setMembers)
      .catch(() => {})
  }, [])
  const loadCouncils = useCallback(() => {
    apiGet<CouncilDTO[]>('/councils')
      .then(setCouncils)
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadProviders()
    loadModels()
    loadMembers()
    loadCouncils()
  }, [loadProviders, loadModels, loadMembers, loadCouncils])

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Setup</p>
          <h1>Settings</h1>
          <p className="subtitle">Providers, models, members, and councils.</p>
        </div>
      </div>

      <div className="tabs">
        {(['providers', 'models', 'members', 'councils'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'providers' && (
        <ProvidersTab providers={providers} reload={loadProviders} onModelsChanged={loadModels} />
      )}
      {tab === 'models' && <ModelsTab models={models} providers={providers} reload={loadModels} />}
      {tab === 'members' && <MembersTab members={members} models={models} reload={loadMembers} />}
      {tab === 'councils' && <CouncilsTab councils={councils} members={members} reload={loadCouncils} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Providers                                                          */
/* ------------------------------------------------------------------ */

function ProvidersTab({
  providers,
  reload,
  onModelsChanged,
}: {
  providers: ProviderDTO[]
  reload: () => void
  onModelsChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [name, setName] = useState('')
  const [protocol, setProtocol] = useState<ProviderProtocol>('openai_compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testNote, setTestNote] = useState<string | null>(null)
  const [pullFor, setPullFor] = useState<string | null>(null)

  useEffect(() => {
    apiGet<{ presets: Preset[] }>('/meta/providers')
      .then((m) => setPresets(m.presets))
      .catch(() => {})
  }, [])

  function openAdd() {
    setEditId(null)
    setName('')
    setProtocol('openai_compatible')
    setBaseUrl('')
    setApiKey('')
    setError(null)
    setOpen(true)
  }

  function openEdit(p: ProviderDTO) {
    setEditId(p.id)
    setName(p.name)
    setProtocol(p.protocol)
    setBaseUrl(p.baseUrl ?? '')
    setApiKey('')
    setError(null)
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        name,
        protocol,
        baseUrl: baseUrl || null,
      }
      if (apiKey) payload.apiKey = apiKey

      if (editId) {
        await apiSend(`/providers/${editId}`, 'PATCH', payload)
      } else {
        await apiSend('/providers', 'POST', payload)
      }
      setOpen(false)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    await apiSend(`/providers/${id}`, 'DELETE')
    reload()
  }

  async function handleTest(id: string) {
    try {
      const res = await apiSend<{ ok: boolean; latencyMs: number; message: string }>(`/providers/${id}/test`, 'POST')
      setTestNote(res.ok ? `Connected in ${res.latencyMs}ms` : res.message)
    } catch (e) {
      setTestNote(`Test failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Providers</h2>
        <button className="primary" onClick={openAdd}>
          Add provider
        </button>
      </div>

      {testNote && <p className="notice">{testNote}</p>}

      {providers.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">⚙</div>
          No providers configured. Add one to get started.
        </div>
      ) : (
        <div className="grid-auto">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onDelete={handleDelete}
              onTest={handleTest}
              onEdit={openEdit}
              onPullModels={(prov) => setPullFor(prov.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? 'Edit Provider' : 'Add Provider'}
        actions={
          <>
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary" onClick={save} disabled={busy || !name}>
              {busy ? 'Saving…' : editId ? 'Update' : 'Add Provider'}
            </button>
          </>
        }
      >
        {!editId && (
          <>
            <label>Preset</label>
            <select
              onChange={(e) => {
                const p = presets.find((x) => x.key === e.target.value)
                if (p) {
                  setProtocol(p.protocol as ProviderProtocol)
                  setBaseUrl(p.baseUrl ?? '')
                  setName(p.key.charAt(0).toUpperCase() + p.key.slice(1))
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Choose a preset…
              </option>
              {presets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.key}
                </option>
              ))}
            </select>
          </>
        )}

        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI" />

        <label>Protocol</label>
        <select value={protocol} onChange={(e) => setProtocol(e.target.value as ProviderProtocol)}>
          <option value="openai_compatible">OpenAI-compatible</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google Gemini</option>
          <option value="mock">Mock</option>
        </select>

        <label>Base URL</label>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
        <div className="input-hint">Leave empty for protocol default</div>

        <label>API Key {editId ? '(leave empty to keep current)' : ''}</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
        <div className="input-hint">Encrypted at rest with AES-256-GCM</div>

        {error && <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: '0.85rem' }}>{error}</p>}
      </Modal>

      <CatalogPicker
        open={!!pullFor}
        onClose={() => setPullFor(null)}
        providers={providers}
        initialProviderId={pullFor ?? undefined}
        onEnrolled={onModelsChanged}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Models                                                             */
/* ------------------------------------------------------------------ */

function ModelsTab({
  models,
  providers,
  reload,
}: {
  models: ModelDTO[]
  providers: ProviderDTO[]
  reload: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState<string | null>(null)
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [ctx, setCtx] = useState('128000')
  const [inPrice, setInPrice] = useState('')
  const [outPrice, setOutPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pullOpen, setPullOpen] = useState(false)
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)

  const filtered = models.filter((m) => {
    if (providerFilter && m.providerId !== providerFilter) return false
    return (
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.modelId.toLowerCase().includes(search.toLowerCase())
    )
  })

  function applyCatalogModel(m: CatalogModel) {
    setModelId(m.modelId)
    setDisplayName(m.displayName)
    setCtx(m.contextWindow ? String(m.contextWindow) : '')
    setInPrice(m.inputPerMTokUsd != null ? String(m.inputPerMTokUsd) : '')
    setOutPrice(m.outputPerMTokUsd != null ? String(m.outputPerMTokUsd) : '')
  }

  function openAdd() {
    setEditId(null)
    if (providers.length > 0) setProviderId(providerFilter || providers[0]!.id)
    setModelId('')
    setDisplayName('')
    setCtx('128000')
    setInPrice('')
    setOutPrice('')
    setError(null)
    setCatalog(null)
    setCatalogQuery('')
    setOpen(true)
  }

  function openEdit(m: ModelDTO) {
    setEditId(m.id)
    setProviderId(m.providerId)
    setModelId(m.modelId)
    setDisplayName(m.displayName)
    setCtx(m.contextWindow ? String(m.contextWindow) : '')
    setInPrice(m.inputPerMTokUsd != null ? String(m.inputPerMTokUsd) : '')
    setOutPrice(m.outputPerMTokUsd != null ? String(m.outputPerMTokUsd) : '')
    setError(null)
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        providerId,
        modelId,
        displayName: displayName || modelId,
        contextWindow: ctx ? Number(ctx) : null,
        inputPerMTokUsd: inPrice ? Number(inPrice) : null,
        outputPerMTokUsd: outPrice ? Number(outPrice) : null,
      }
      if (editId) {
        await apiSend(`/models/${editId}`, 'PATCH', payload)
      } else {
        await apiSend('/models', 'POST', payload)
      }
      setOpen(false)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this model? Members using it will be disabled.')) return
    await apiSend(`/models/${id}`, 'DELETE')
    reload()
  }

  useEffect(() => {
    if (!open || !providerId || editId) {
      setCatalog(null)
      return
    }
    const selected = providers.find((p) => p.id === providerId)
    if (!selected || selected.protocol === 'mock') {
      setCatalog(null)
      return
    }
    let cancelled = false
    setCatalogLoading(true)
    apiGet<ProviderCatalogDTO>(`/providers/${providerId}/catalog`)
      .then((c) => {
        if (!cancelled) setCatalog(c)
      })
      .catch(() => {
        if (!cancelled) setCatalog(null)
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, providerId, editId, providers])

  const catalogHits = (catalog?.models ?? []).filter((m) => {
    const q = catalogQuery.trim().toLowerCase()
    if (!q) return true
    return m.displayName.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q)
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <h2 style={{ margin: 0 }}>Model Catalog</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setPullOpen(true)}
            disabled={providers.filter((p) => p.protocol !== 'mock').length === 0}
          >
            Pull from provider
          </button>
          <button className="primary" onClick={openAdd}>
            Enroll model
          </button>
        </div>
      </div>

      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder="Search models by name or ID…"
        filters={providers.map((p) => ({
          label: p.name,
          value: p.id,
          active: providerFilter === p.id,
        }))}
        onFilterToggle={(id) => setProviderFilter((cur) => (cur === id ? null : id))}
      />

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">◇</div>
          {search ? 'No models match your search.' : 'No models enrolled. Add one to get started.'}
        </div>
      ) : (
        <div className="grid-auto">
          {filtered.map((m) => {
            const prov = providers.find((p) => p.id === m.providerId)
            return (
              <ModelCard key={m.id} model={m} providerName={prov?.name} onDelete={handleDelete} onEdit={openEdit} />
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? 'Edit Model' : 'Enroll Model'}
        actions={
          <>
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary" onClick={save} disabled={busy || !providerId || !modelId}>
              {busy ? 'Saving…' : editId ? 'Update' : 'Enroll Model'}
            </button>
          </>
        }
      >
        <label>Provider</label>
        <select
          value={providerId}
          onChange={(e) => {
            setProviderId(e.target.value)
            setModelId('')
            setDisplayName('')
            setCtx('128000')
            setInPrice('')
            setOutPrice('')
            setCatalogQuery('')
          }}
          disabled={!!editId}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {!editId && (
          <>
            <label>Available models</label>
            {catalogLoading ? (
              <p className="muted" style={{ fontSize: '0.82rem' }}>
                Loading live catalog…
              </p>
            ) : catalog && catalog.models.length > 0 ? (
              <>
                <input
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder="Filter provider models…"
                />
                <div className="catalog-list compact">
                  {catalogHits.slice(0, 40).map((m) => (
                    <button
                      key={m.modelId}
                      type="button"
                      className={`catalog-row ${modelId === m.modelId ? 'selected' : ''}`}
                      onClick={() => applyCatalogModel(m)}
                    >
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div className="catalog-name">{m.displayName}</div>
                        <div className="catalog-meta">{m.modelId}</div>
                      </div>
                      <div className="catalog-price">
                        {m.inputPerMTokUsd != null
                          ? `$${m.inputPerMTokUsd}/${m.outputPerMTokUsd ?? '—'}`
                          : m.contextWindow
                            ? `${Math.round(m.contextWindow / 1000)}k`
                            : ''}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="input-hint">
                  Selecting a model fills id, context, and published $/MTok pricing
                  {catalog.source ? ` (${catalog.source})` : ''}.
                </div>
              </>
            ) : (
              <div className="input-hint">
                {catalog?.reason || 'No live catalog for this provider. Enter a model id manually.'}
              </div>
            )}
          </>
        )}

        <label>Model ID (as the API expects it)</label>
        <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4o" />

        <label>Display Name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="GPT-4o" />

        <div className="grid-2">
          <div>
            <label>Context Window</label>
            <input value={ctx} onChange={(e) => setCtx(e.target.value)} placeholder="128000" />
          </div>
          <div>
            <label>Pricing ($/M tokens)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={inPrice} onChange={(e) => setInPrice(e.target.value)} placeholder="In: 2.50" />
              <input value={outPrice} onChange={(e) => setOutPrice(e.target.value)} placeholder="Out: 10" />
            </div>
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: '0.85rem' }}>{error}</p>}
      </Modal>

      <CatalogPicker
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        providers={providers}
        initialProviderId={providerFilter || providers[0]?.id}
        onEnrolled={reload}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Members                                                            */
/* ------------------------------------------------------------------ */

function MembersTab({ members, models, reload }: { members: MemberDTO[]; models: ModelDTO[]; reload: () => void }) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [modelId, setModelId] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState('0.7')
  const [color, setColor] = useState(COLORS[0]!)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function openAdd() {
    setEditId(null)
    setName('')
    setModelId(models.length > 0 ? models[0]!.id : '')
    setSystemPrompt('')
    setTemperature('0.7')
    setColor(COLORS[0]!)
    setError(null)
    setOpen(true)
  }

  function openEdit(m: MemberDTO) {
    setEditId(m.id)
    setName(m.name)
    setModelId(m.modelId)
    setSystemPrompt(m.systemPrompt || '')
    setTemperature(String(m.temperature))
    setColor(m.avatarColor)
    setError(null)
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        name,
        modelId,
        systemPrompt: systemPrompt || null,
        temperature: Number(temperature),
        avatarColor: color,
      }
      if (editId) {
        await apiSend(`/members/${editId}`, 'PATCH', payload)
      } else {
        await apiSend('/members', 'POST', payload)
      }
      setOpen(false)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this member?')) return
    await apiSend(`/members/${id}`, 'DELETE')
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Council Members</h2>
        <button className="primary" onClick={openAdd}>
          + Add Member
        </button>
      </div>

      {members.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">◈</div>
          No members yet. Create one to assign to a council.
        </div>
      ) : (
        <div className="grid-auto">
          {members.map((m) => (
            <MemberCard key={m.id} member={m} onDelete={handleDelete} onEdit={openEdit} />
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? 'Edit Member' : 'Add Member'}
        actions={
          <>
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary" onClick={save} disabled={busy || !name || !modelId}>
              {busy ? 'Saving…' : editId ? 'Update' : 'Add Member'}
            </button>
          </>
        }
      >
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Strategist" />

        <label>Model</label>
        <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName} ({m.modelId})
            </option>
          ))}
        </select>

        <label>Persona System Prompt</label>
        <textarea
          rows={4}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are The Strategist — you think in tradeoffs, second-order effects…"
        />

        <label>Temperature: {temperature}</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          style={{ width: '100%' }}
        />

        <label>Avatar Color</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: c,
                border: color === c ? '2px solid white' : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
                minHeight: 'unset',
              }}
            />
          ))}
        </div>

        {error && <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: '0.85rem' }}>{error}</p>}
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Councils                                                           */
/* ------------------------------------------------------------------ */

function CouncilsTab({
  councils,
  members,
  reload,
}: {
  councils: CouncilDTO[]
  members: MemberDTO[]
  reload: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [strategy, setStrategy] = useState<StrategyKind>('debate')
  const [rounds, setRounds] = useState(3)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [moderatorId, setModeratorId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function openAdd() {
    setEditId(null)
    setName('')
    setDescription('')
    setStrategy('debate')
    setRounds(3)
    setSelectedIds([])
    setModeratorId('')
    setError(null)
    setOpen(true)
  }

  function openEdit(c: CouncilDTO) {
    setEditId(c.id)
    setName(c.name)
    setDescription(c.description || '')
    setStrategy(c.strategy)
    setRounds(c.rounds)
    setSelectedIds(c.members.map((m) => m.id))
    setModeratorId(c.moderatorMemberId || '')
    setError(null)
    setOpen(true)
  }

  function toggleMember(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        name,
        description: description || null,
        strategy,
        rounds,
        memberIds: selectedIds,
        moderatorMemberId: moderatorId || null,
      }
      if (editId) {
        await apiSend(`/councils/${editId}`, 'PATCH', payload)
      } else {
        await apiSend('/councils', 'POST', payload)
      }
      setOpen(false)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this council?')) return
    await apiSend(`/councils/${id}`, 'DELETE')
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Councils</h2>
        <button className="primary" onClick={openAdd}>
          + Create Council
        </button>
      </div>

      {councils.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🏛</div>
          No councils configured. Create one to start deliberating.
        </div>
      ) : (
        <div className="grid-auto">
          {councils.map((c) => (
            <CouncilCard key={c.id} council={c} onDelete={handleDelete} onEdit={openEdit} />
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? 'Edit Council' : 'Create Council'}
        actions={
          <>
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary" onClick={save} disabled={busy || !name || selectedIds.length === 0}>
              {busy ? 'Saving…' : editId ? 'Update' : 'Create Council'}
            </button>
          </>
        }
      >
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Architecture Council" />

        <label>Description</label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this council is designed to deliberate on…"
        />

        <div className="grid-2">
          <div>
            <label>Strategy</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyKind)}>
              <option value="debate">⚔ Debate (Chatroom roundtable)</option>
              <option value="round_robin">↻ Round Robin (Parallel takes)</option>
            </select>
          </div>
          <div>
            <label>Rounds (1–100)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={rounds}
              onChange={(e) => setRounds(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <label>Members</label>
        <div
          style={{
            maxHeight: 180,
            overflowY: 'auto',
            padding: 8,
            background: 'var(--bg-inset)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}
        >
          {members.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.82rem', padding: 8 }}>
              No members available. Create members first.
            </p>
          ) : (
            members.map((m) => (
              <label
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.id)}
                  onChange={() => toggleMember(m.id)}
                  style={{ width: 'auto' }}
                />
                <span
                  className="avatar sm"
                  style={{ background: m.avatarColor, width: 20, height: 20, fontSize: '0.5rem' }}
                >
                  {m.name.slice(0, 2).toUpperCase()}
                </span>
                {m.name}
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  {m.modelName || ''}
                </span>
              </label>
            ))
          )}
        </div>

        <label>Moderator (optional)</label>
        <select value={moderatorId} onChange={(e) => setModeratorId(e.target.value)}>
          <option value="">None — no synthesis</option>
          {selectedIds.map((id) => {
            const m = members.find((x) => x.id === id)
            return m ? (
              <option key={id} value={id}>
                {m.name}
              </option>
            ) : null
          })}
        </select>
        <div className="input-hint">The moderator writes a final synthesis of the council&apos;s deliberation.</div>

        {error && <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: '0.85rem' }}>{error}</p>}
      </Modal>
    </div>
  )
}
