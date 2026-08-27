'use client'

import { useEffect, useId, useRef, useState } from 'react'

interface MermaidDiagramProps {
  chart: string
}

interface MermaidAPI {
  initialize(options: Record<string, unknown>): void
  render(id: string, text: string): Promise<{ svg: string }>
}

declare global {
  interface Window {
    __mermaidPromise?: Promise<MermaidAPI | null>
  }
}

async function getMermaid(): Promise<MermaidAPI | null> {
  if (typeof window === 'undefined') return null
  if (!window.__mermaidPromise) {
    window.__mermaidPromise = (async (): Promise<MermaidAPI | null> => {
      try {
        const loadModule = new Function('url', 'return import(url)')
        const mod = (await loadModule('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs')) as {
          default?: MermaidAPI
        } & MermaidAPI
        const mermaid = mod.default || mod
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          themeVariables: {
            darkMode: true,
            background: '#121215',
            primaryColor: '#6366f1',
            primaryTextColor: '#f4f4f5',
            primaryBorderColor: '#818cf8',
            lineColor: '#a1a1aa',
            secondaryColor: '#27272a',
            tertiaryColor: '#18181b',
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const uniqueId = useId().replace(/[^a-zA-Z0-9]/g, '_')

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const mermaid = await getMermaid()
        if (cancelled) return
        if (!mermaid) {
          setError('Mermaid visualizer unavailable')
          return
        }
        const cleanChart = chart.trim()
        const { svg: renderedSvg } = await mermaid.render(`mermaid_${uniqueId}_${Date.now()}`, cleanChart)
        if (!cancelled) {
          setSvg(renderedSvg)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [chart, uniqueId])

  function handleCopy() {
    navigator.clipboard?.writeText(chart)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        margin: '14px 0',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-accent)',
        background: 'var(--bg-card)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.74rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
          <span>📊</span>
          <span>Mermaid Diagram</span>
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowRaw(!showRaw)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: '0.72rem',
              padding: '2px 6px',
            }}
          >
            {showRaw ? 'Show Diagram' : 'View Code'}
          </button>
          <button
            onClick={handleCopy}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: '0.72rem',
              padding: '2px 6px',
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {showRaw ? (
        <pre
          style={{
            margin: 0,
            padding: 14,
            fontSize: '0.8rem',
            overflowX: 'auto',
            background: '#09090b',
            color: '#a1a1aa',
          }}
        >
          <code>{chart}</code>
        </pre>
      ) : error ? (
        <div style={{ padding: 14 }}>
          <p style={{ color: 'var(--danger)', fontSize: '0.78rem', margin: '0 0 8px' }}>
            Diagram rendering note: {error}
          </p>
          <pre
            style={{
              margin: 0,
              padding: 10,
              fontSize: '0.78rem',
              overflowX: 'auto',
              background: '#09090b',
              borderRadius: 6,
            }}
          >
            <code>{chart}</code>
          </pre>
        </div>
      ) : svg ? (
        <div
          ref={containerRef}
          style={{
            padding: '16px 12px',
            display: 'flex',
            justifyContent: 'center',
            overflowX: 'auto',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
          Rendering diagram…
        </div>
      )}
    </div>
  )
}
