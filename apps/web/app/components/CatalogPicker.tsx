'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { apiGet, apiSend } from '../lib/api'
import type { ProviderCatalogDTO, ProviderDTO } from '@opencouncil/shared'

function formatPrice(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n === 0) return 'free'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export default function CatalogPicker({
  open,
  onClose,
  providers,
  initialProviderId,
  onEnrolled,
}: {
  open: boolean
  onClose: () => void
  providers: ProviderDTO[]
  initialProviderId?: string
  onEnrolled: () => void
}) {
  const usable = providers.filter((p) => p.protocol !== 'mock')
  const [providerId, setProviderId] = useState(initialProviderId || usable[0]?.id || '')
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setProviderId(initialProviderId || providers.find((p) => p.protocol !== 'mock')?.id || '')
      setSearch('')
      setSelected(new Set())
      setError(null)
    }
  }, [open, initialProviderId, providers])

  useEffect(() => {
    if (!open || !providerId) return
    let cancelled = false
    setLoading(true)
    setCatalog(null)
    setError(null)
    apiGet<ProviderCatalogDTO>(`/providers/${providerId}/catalog`)
      .then((c) => {
        if (!cancelled) {
          setCatalog(c)
          setSelected(new Set())
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, providerId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = catalog?.models ?? []
    if (!q) return rows
    return rows.filter((m) => m.displayName.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q))
  }, [catalog, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisible() {
    const ids = filtered.map((m) => m.modelId)
    const allOn = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOn) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  async function enroll() {
    if (!providerId || selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      await apiSend(`/providers/${providerId}/catalog/enroll`, 'POST', { modelIds: [...selected] })
      onEnrolled()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const live = usable.find((p) => p.id === providerId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Pull models"
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={enroll} disabled={busy || selected.size === 0}>
            {busy ? 'Enrolling…' : `Enroll ${selected.size || ''}`.trim()}
          </button>
        </>
      }
    >
      <label>Provider</label>
      <select
        value={providerId}
        onChange={(e) => {
          setProviderId(e.target.value)
          setSelected(new Set())
        }}
      >
        {usable.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {live && !live.hasApiKey && (
        <div className="input-hint">This provider has no API key. Local runtimes still list models.</div>
      )}

      <label>Filter</label>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search available models…" />

      <div className="catalog-toolbar">
        <span className="muted">
          {loading
            ? 'Loading catalog…'
            : catalog
              ? `${filtered.length} available${catalog.source ? ` · ${catalog.source}` : ''}`
              : 'No catalog'}
        </span>
        <button className="ghost sm" type="button" onClick={toggleVisible} disabled={filtered.length === 0}>
          {filtered.every((m) => selected.has(m.modelId)) && filtered.length > 0 ? 'Clear visible' : 'Select visible'}
        </button>
      </div>

      {catalog?.reason && <p className="notice">{catalog.reason}</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="catalog-list">
        {loading && <div className="catalog-empty">Fetching live models…</div>}
        {!loading && filtered.length === 0 && <div className="catalog-empty">No models match.</div>}
        {!loading &&
          filtered.map((m) => (
            <label key={m.modelId} className={`catalog-row ${selected.has(m.modelId) ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(m.modelId)}
                onChange={() => toggle(m.modelId)}
                style={{ width: 'auto' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="catalog-name">
                  {m.displayName}
                  {m.enrolled ? <span className="protocol-badge">enrolled</span> : null}
                </div>
                <div className="catalog-meta">{m.modelId}</div>
              </div>
              <div className="catalog-price">
                <span>{m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k ctx` : ''}</span>
                <span>
                  {formatPrice(m.inputPerMTokUsd)} / {formatPrice(m.outputPerMTokUsd)}
                </span>
              </div>
            </label>
          ))}
      </div>
      <div className="input-hint">
        Prices are USD per million tokens when the provider (or OpenRouter) publishes them.
      </div>
    </Modal>
  )
}
