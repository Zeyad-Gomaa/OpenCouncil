import { describe, expect, it } from 'vitest'
import { isMermaidErrorSvg, sanitizeMermaid } from './sanitizeMermaid'

describe('sanitizeMermaid', () => {
  it('passes through a valid flowchart', () => {
    const src = `flowchart TD
      A[Start] --> B{OK?}
      B -->|yes| C[Done]`
    expect(sanitizeMermaid(src)).toContain('flowchart TD')
    expect(sanitizeMermaid(src)).toContain('A[Start]')
  })

  it('unwraps accidental fences and smart quotes', () => {
    const src = '```mermaid\ngraph TD\n  A[“Hello”] --> B\n```'
    const out = sanitizeMermaid(src)
    expect(out.startsWith('```')).toBe(false)
    expect(out).toContain('"Hello"')
  })

  it('normalizes <br> and prefixes a diagram type when missing', () => {
    const out = sanitizeMermaid('A[Start<br>here] --> B')
    expect(out.startsWith('flowchart TD')).toBe(true)
    expect(out).toContain('<br/>')
  })

  it('renames reserved `end` node ids but keeps subgraph terminators', () => {
    const src = `flowchart TD
      start --> end[Finish]
      subgraph G
        a --> b
      end`
    const out = sanitizeMermaid(src)
    expect(out).toContain('endNode[Finish]')
    expect(out).toMatch(/\n\s*end\s*$/)
  })

  it('detects mermaid error SVGs', () => {
    expect(isMermaidErrorSvg('<svg><text>Syntax error in text</text><text>mermaid version 10.9.8</text></svg>')).toBe(
      true,
    )
    expect(isMermaidErrorSvg('<svg><g class="error-icon"></g></svg>')).toBe(true)
    expect(isMermaidErrorSvg('<svg><text>Hello</text></svg>')).toBe(false)
  })
})
