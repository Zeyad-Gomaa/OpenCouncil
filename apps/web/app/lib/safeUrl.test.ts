import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MarkdownRenderer from '../components/MarkdownRenderer'
import { safeUrl } from './safeUrl'

describe('untrusted markdown URLs', () => {
  it('allows explicit web and email links', () => {
    expect(safeUrl('https://example.com/source?q=one')).toBe('https://example.com/source?q=one')
    expect(safeUrl('mailto:test@example.com')).toBe('mailto:test@example.com')
    expect(safeUrl('mailto:test@example.com', true)).toBeNull()
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,test',
    'file:///etc/passwd',
    '//example.com',
    '/api/v1/providers',
    'https://user:pass@example.com',
  ])('blocks %s', (url) => {
    expect(safeUrl(url)).toBeNull()
  })

  it('renders unsafe links as text and remote images only after consent', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        content: '[unsafe](javascript:evil) [source](https://example.com) ![photo](https://images.example/photo.png)',
      }),
    )
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://example.com/"')
    expect(html).not.toContain('<img')
    expect(html).toContain('Load image from images.example')
  })
})
