import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatResearchMarkdown, formatSearchResults, parseDuckDuckGoHtml, searchWeb } from '../engine/web-search.js'

const DDG_HTML = `
<div class="result__body">
  <a class="result__a" href="https://example.com/docs">OpenCouncil Docs</a>
  <a class="result__snippet">A multi-agent deliberation platform.</a>
</div>
</div>
`

const DDG_LITE = `
<a class="result-link" href="https://example.com/lite">Lite Result</a>
<td class="result-snippet">From DuckDuckGo lite.</td>
`

const WIKI_JSON = {
  query: {
    search: [
      {
        title: 'Deliberation',
        snippet: 'Deliberation is a <span class="searchmatch">process</span> of thoughtfully weighing options.',
      },
    ],
  },
}

describe('web search', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TAVILY_API_KEY
    delete process.env.BRAVE_API_KEY
    delete process.env.SEARXNG_URL
  })

  it('parses classic DuckDuckGo HTML result blocks', () => {
    const results = parseDuckDuckGoHtml(DDG_HTML, 5)
    expect(results).toEqual([
      {
        title: 'OpenCouncil Docs',
        url: 'https://example.com/docs',
        snippet: 'A multi-agent deliberation platform.',
      },
    ])
  })

  it('parses DuckDuckGo lite markup', () => {
    const results = parseDuckDuckGoHtml(DDG_LITE, 5)
    expect(results[0]).toMatchObject({
      title: 'Lite Result',
      url: 'https://example.com/lite',
      snippet: 'From DuckDuckGo lite.',
    })
  })

  it('falls back to Wikipedia when DuckDuckGo returns nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('duckduckgo')) {
          return new Response('<html>no results</html>', { status: 200 })
        }
        if (url.includes('wikipedia.org')) {
          return new Response(JSON.stringify(WIKI_JSON), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response('nope', { status: 404 })
      }),
    )

    const results = await searchWeb('deliberation theory', 3, 4000)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.title).toBe('Deliberation')
    expect(results[0]?.url).toContain('wikipedia.org/wiki/Deliberation')
    expect(results[0]?.snippet).toContain('thoughtfully weighing options')
  })

  it('prefers Tavily when a key is configured', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('tavily.com')) {
          return new Response(
            JSON.stringify({
              results: [{ title: 'Tavily Hit', url: 'https://tavily.example/a', content: 'Paid search snippet' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    const results = await searchWeb('architecture review', 3, 4000)
    expect(results).toEqual([{ title: 'Tavily Hit', url: 'https://tavily.example/a', snippet: 'Paid search snippet' }])
  })

  it('formatSearchResults wraps citations for the council prompt', () => {
    const formatted = formatSearchResults([
      { title: 'Docs', url: 'https://opencouncil.dev', snippet: 'Council platform.' },
    ])
    expect(formatted).toContain('=== LIVE WEB RESEARCH & SOURCES ===')
    expect(formatted).toContain('https://opencouncil.dev')
  })

  it('formatResearchMarkdown embeds images and video links', () => {
    const md = formatResearchMarkdown({
      web: [{ title: 'LLM', url: 'https://example.com/llm', snippet: 'A language model.' }],
      images: [
        {
          title: 'Diagram',
          url: 'https://en.wikipedia.org/wiki/LLM',
          snippet: 'Diagram',
          kind: 'image',
          imageUrl: 'https://upload.wikimedia.org/example.jpg',
        },
      ],
      videos: [{ title: 'Talk', url: 'https://www.youtube.com/watch?v=abc', snippet: 'Lecture', kind: 'video' }],
    })
    expect(md).toContain('[LLM](https://example.com/llm)')
    expect(md).toContain('![Diagram](https://upload.wikimedia.org/example.jpg)')
    expect(md).toContain('[Talk](https://www.youtube.com/watch?v=abc)')
  })
})
