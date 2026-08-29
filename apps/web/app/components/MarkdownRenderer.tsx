'use client'

import React, { useState } from 'react'
import MermaidDiagram from './MermaidDiagram'
import { safeUrl } from '../lib/safeUrl'

interface MarkdownRendererProps {
  content: string
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null

  // 1. Tokenize blocks: code blocks vs markdown paragraphs/tables/lists
  const blocks = parseBlocks(content)

  return (
    <div className="md-rendered" style={{ lineHeight: 1.65, fontSize: '0.92rem' }}>
      {blocks.map((b, idx) => {
        if (b.type === 'mermaid') {
          return <MermaidDiagram key={idx} chart={b.content} />
        }
        if (b.type === 'code') {
          return <CodeBlock key={idx} code={b.content} lang={b.lang} />
        }
        if (b.type === 'table') {
          return <TableBlock key={idx} rows={b.rows} />
        }
        if (b.type === 'heading') {
          const Tag = `h${b.level}` as keyof React.JSX.IntrinsicElements
          return (
            <Tag
              key={idx}
              style={{
                marginTop: b.level === 1 ? 18 : b.level === 2 ? 14 : 10,
                marginBottom: 6,
                fontWeight: 600,
                fontSize: b.level === 1 ? '1.25rem' : b.level === 2 ? '1.1rem' : '0.98rem',
                color: 'var(--text-primary)',
              }}
            >
              {renderInline(b.content)}
            </Tag>
          )
        }
        if (b.type === 'quote') {
          return (
            <blockquote
              key={idx}
              style={{
                margin: '10px 0',
                padding: '8px 14px',
                borderLeft: '3px solid var(--accent)',
                background: 'rgba(99, 102, 241, 0.05)',
                borderRadius: '0 var(--radius) var(--radius) 0',
                color: 'var(--text-secondary)',
                fontSize: '0.88rem',
              }}
            >
              {renderInline(b.content)}
            </blockquote>
          )
        }
        if (b.type === 'list') {
          const ListTag = b.ordered ? 'ol' : 'ul'
          return (
            <ListTag key={idx} style={{ margin: '8px 0', paddingLeft: 22, color: 'var(--text-primary)' }}>
              {b.items.map((item, i) => (
                <li key={i} style={{ margin: '3px 0' }}>
                  {renderInline(item)}
                </li>
              ))}
            </ListTag>
          )
        }
        if (b.type === 'hr') {
          return <hr key={idx} style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
        }
        return (
          <p key={idx} style={{ margin: '8px 0', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
            {renderInline(b.content)}
          </p>
        )
      })}
    </div>
  )
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        margin: '12px 0',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        background: '#09090b',
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
          fontSize: '0.72rem',
          color: 'var(--text-tertiary)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{lang || 'code'}</span>
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
      <pre
        style={{
          margin: 0,
          padding: 12,
          overflowX: 'auto',
          fontSize: '0.82rem',
          lineHeight: 1.5,
          fontFamily: 'var(--font-mono, monospace)',
          color: '#e4e4e7',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

function TableBlock({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null
  const header = rows[0]
  const body = rows.slice(1)

  return (
    <div style={{ overflowX: 'auto', margin: '12px 0' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.85rem',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        {header && (
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)' }}>
              {header.map((col, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>
                  {renderInline(col)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, rIdx) => (
            <tr
              key={rIdx}
              style={{
                borderBottom: rIdx === body.length - 1 ? 'none' : '1px solid var(--border)',
                background: rIdx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
              }}
            >
              {row.map((cell, cIdx) => (
                <td key={cIdx} style={{ padding: '8px 12px' }}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Inline markdown renderer (bold, italic, code, links, images, strike) */
function renderInline(text: string): React.ReactNode {
  if (!text) return null

  // Simple recursive/segmented tokenizer
  const elements: React.ReactNode[] = []
  let lastIndex = 0

  // Combined token matcher
  const combined =
    /(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)/g
  let match: RegExpExecArray | null

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index))
    }

    if (match[1]) {
      // Image: ![alt](url)
      const alt = match[2] || ''
      const src = safeUrl(match[3] || '', true)
      if (!src) {
        elements.push(alt || '[blocked image]')
        lastIndex = combined.lastIndex
        continue
      }
      elements.push(
        <span
          key={match.index}
          style={{ display: 'block', margin: '10px 0', borderRadius: 'var(--radius)', overflow: 'hidden' }}
        >
          <RemoteImage src={src} alt={alt} />
          {alt && (
            <span
              style={{
                display: 'block',
                fontSize: '0.74rem',
                color: 'var(--text-tertiary)',
                marginTop: 4,
                fontStyle: 'italic',
              }}
            >
              {alt}
            </span>
          )}
        </span>,
      )
    } else if (match[4]) {
      // Link: [text](url)
      const label = match[5] || ''
      const href = safeUrl(match[6] || '')
      if (!href) {
        elements.push(label)
        lastIndex = combined.lastIndex
        continue
      }
      elements.push(
        <a
          key={match.index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--accent-bright, #818cf8)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            wordBreak: 'break-all',
          }}
        >
          {label} ↗
        </a>,
      )
    } else if (match[7]) {
      // Code: `code`
      elements.push(
        <code
          key={match.index}
          style={{
            background: 'rgba(255,255,255,0.07)',
            padding: '2px 5px',
            borderRadius: 4,
            fontSize: '0.85em',
            fontFamily: 'var(--font-mono, monospace)',
            color: '#f43f5e',
          }}
        >
          {match[8]}
        </code>,
      )
    } else if (match[9]) {
      // Bold: **bold**
      elements.push(<strong key={match.index}>{match[10]}</strong>)
    } else if (match[11]) {
      // Italic: *italic*
      elements.push(<em key={match.index}>{match[12]}</em>)
    } else if (match[13]) {
      // Strike: ~~strike~~
      elements.push(<del key={match.index}>{match[14]}</del>)
    }

    lastIndex = combined.lastIndex
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex))
  }

  return elements.length === 1 ? elements[0] : elements
}

function RemoteImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  if (!loaded)
    return (
      <button
        type="button"
        className="ghost sm"
        onClick={() => setLoaded(true)}
        title="Loading sends a request to this external host. Only load images you trust."
      >
        Load image from {new URL(src).host}
      </button>
    )
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}
    />
  )
}

type Block =
  | { type: 'code'; lang: string; content: string }
  | { type: 'mermaid'; content: string }
  | { type: 'heading'; level: number; content: string }
  | { type: 'quote'; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' }
  | { type: 'paragraph'; content: string }

function parseBlocks(md: string): Block[] {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // 1. Code fence: ```lang
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        codeLines.push(lines[i]!)
        i++
      }
      i++ // skip closing fence
      const code = codeLines.join('\n')
      if (lang.toLowerCase() === 'mermaid' || lang.toLowerCase().startsWith('mermaid ')) {
        blocks.push({ type: 'mermaid', content: code })
      } else {
        blocks.push({ type: 'code', lang, content: code })
      }
      continue
    }

    // 2. Heading: #, ##, ###, ####
    const headMatch = /^(#{1,4})\s+(.+)$/.exec(line)
    if (headMatch && headMatch[1] && headMatch[2]) {
      blocks.push({ type: 'heading', level: headMatch[1].length, content: headMatch[2] })
      i++
      continue
    }

    // 3. Blockquote: > ...
    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i]!.startsWith('>')) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', content: quoteLines.join('\n') })
      continue
    }

    // 4. Horizontal rule: --- or ***
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // 5. Table: | col | col |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i]!.trim().startsWith('|') && lines[i]!.trim().endsWith('|')) {
        // Skip separator row |---|---|
        if (!/^[|\s:-]+$/.test(lines[i]!.trim())) {
          const cells = lines[i]!.trim()
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim())
          tableLines.push(cells as unknown as string)
        }
        i++
      }
      blocks.push({ type: 'table', rows: tableLines as unknown as string[][] })
      continue
    }

    // 6. List: - or * or 1.
    const listMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line)
    if (listMatch) {
      const isOrdered = /\d+\./.test(listMatch[2]!)
      const items: string[] = []
      while (i < lines.length) {
        const itemMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(lines[i]!)
        if (!itemMatch) break
        items.push(itemMatch[3]!)
        i++
      }
      blocks.push({ type: 'list', ordered: isOrdered, items })
      continue
    }

    // 7. Regular paragraph / text block
    const pLines: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.trim().startsWith('```') &&
      !lines[i]!.startsWith('>') &&
      !/^(#{1,4})\s+/.test(lines[i]!) &&
      !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i]!) &&
      !(lines[i]!.trim().startsWith('|') && lines[i]!.trim().endsWith('|'))
    ) {
      pLines.push(lines[i]!)
      i++
    }

    if (pLines.length > 0) {
      blocks.push({ type: 'paragraph', content: pLines.join('\n') })
    } else {
      i++
    }
  }

  return blocks
}

export default React.memo(MarkdownRenderer)
