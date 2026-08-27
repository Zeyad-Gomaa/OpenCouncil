'use client'

import { useEffect, useId, useState } from 'react'
import { cleanupMermaidDom, isMermaidErrorSvg, sanitizeMermaid } from '../lib/sanitizeMermaid'

interface MermaidDiagramProps {
  chart: string
}

interface MermaidAPI {
  initialize(options: Record<string, unknown>): void
  parse(text: string): Promise<unknown>
  render(id: string, text: string): Promise<{ svg: string }>
}

declare global {
  interface Window {
    __mermaidPromise?: Promise<MermaidAPI | null>
  }
}

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.esm.min.mjs'

async function getMermaid(): Promise<MermaidAPI | null> {
  if (typeof window === 'undefined') return null
  if (!window.__mermaidPromise) {
    window.__mermaidPromise = (async (): Promise<MermaidAPI | null> => {
      try {
        const loadModule = new Function('url', 'return import(url)') as (url: string) => Promise<
          {
            default?: MermaidAPI
          } & MermaidAPI
        >
        const mod = await loadModule(MERMAID_CDN)
        const mermaid = (mod.default || mod) as MermaidAPI
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          suppressErrorRendering: true,
          themeVariables: {
            darkMode: true,
            background: '#0a0a0a',
            primaryColor: '#262626',
            primaryTextColor: '#ececec',
            primaryBorderColor: '#525252',
            lineColor: '#a3a3a3',
            secondaryColor: '#171717',
            tertiaryColor: '#111111',
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          },
        })
        return mermaid
      } catch (e) {
        console.warn('Failed to load mermaid from CDN:', e)
        return null
      }
    })()
  }
  return window.__mermaidPromise
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const uniqueId = useId().replace(/[^a-zA-Z0-9]/g, '_')

  useEffect(() => {
    let cancelled = false
    async function render() {
      setError(null)
      setSvg(null)
      const mermaid = await getMermaid()
      if (cancelled) return
      if (!mermaid) {
        setError('Mermaid visualizer unavailable')
        return
      }

      const candidates = Array.from(new Set([chart.trim(), sanitizeMermaid(chart)].filter(Boolean)))
      let lastErr = 'Could not parse diagram'
      for (const candidate of candidates) {
        const renderId = `mmd_${uniqueId}_${Math.random().toString(36).slice(2, 8)}`
        try {
          if (typeof mermaid.parse === 'function') await mermaid.parse(candidate)
          const { svg: renderedSvg } = await mermaid.render(renderId, candidate)
          cleanupMermaidDom()
          if (cancelled) return
          if (!renderedSvg || isMermaidErrorSvg(renderedSvg)) {
            lastErr = 'Invalid Mermaid syntax'
            continue
          }
          setSvg(renderedSvg)
          setError(null)
          return
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err)
          cleanupMermaidDom()
        }
      }
      if (!cancelled) {
        setSvg(null)
        setError(friendlyMermaidError(lastErr))
      }
    }
    void render()
    return () => {
      cancelled = true
      cleanupMermaidDom()
    }
  }, [chart, uniqueId])

  function handleCopy() {
    navigator.clipboard?.writeText(chart)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="diagram-card">
      <div className="diagram-card-bar">
        <span className="diagram-card-label">Diagram</span>
        <div className="diagram-card-actions">
          <button type="button" className="ghost sm" onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? 'Show diagram' : 'View source'}
          </button>
          <button type="button" className="ghost sm" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {showRaw ? (
        <pre className="diagram-source">
          <code>{chart}</code>
        </pre>
      ) : error ? (
        <div className="diagram-fallback">
          <p className="diagram-fallback-note">{error}</p>
          <pre className="diagram-source">
            <code>{chart}</code>
          </pre>
        </div>
      ) : svg ? (
        <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="diagram-loading">Rendering diagram…</div>
      )}
    </div>
  )
}

function friendlyMermaidError(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('syntax error') || lower.includes('parse') || lower.includes('lexical')) {
    return 'This diagram has invalid Mermaid syntax, so the source is shown instead.'
  }
  if (lower.includes('unavailable')) return raw
  return 'This diagram could not be rendered. Source is shown below.'
}
