/** Web search: paid backends first, then DuckDuckGo, then Wikipedia. */

export interface SearchResult {
  title: string
  url: string
  snippet: string
  kind?: 'web' | 'image' | 'video'
  imageUrl?: string
}

export interface ResearchPack {
  web: SearchResult[]
  images: SearchResult[]
  videos: SearchResult[]
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/**
 * Searches the web using the best available provider:
 * 1. Tavily (if TAVILY_API_KEY is set)
 * 2. Brave (if BRAVE_API_KEY is set)
 * 3. SearXNG (if SEARXNG_URL is set)
 * 4. DuckDuckGo HTML / Lite (built-in)
 * 5. Wikipedia OpenSearch (built-in, reliable fallback)
 */
export async function searchWeb(query: string, maxResults = 5, timeoutMs = 8000): Promise<SearchResult[]> {
  const cleanQuery = query.trim().slice(0, 400)
  if (!cleanQuery) return []
  const started = Date.now()
  const remain = (): number => Math.max(800, timeoutMs - (Date.now() - started))

  const backends: Array<() => Promise<SearchResult[]>> = []
  if (process.env.TAVILY_API_KEY) {
    backends.push(() => searchTavily(cleanQuery, process.env.TAVILY_API_KEY!, maxResults, remain()))
  }
  if (process.env.BRAVE_API_KEY) {
    backends.push(() => searchBrave(cleanQuery, process.env.BRAVE_API_KEY!, maxResults, remain()))
  }
  if (process.env.SEARXNG_URL) {
    backends.push(() => searchSearXNG(cleanQuery, process.env.SEARXNG_URL!, maxResults, remain()))
  }
  backends.push(() => searchDuckDuckGo(cleanQuery, maxResults, remain()))
  backends.push(() => searchWikipedia(cleanQuery, maxResults, remain()))

  for (const run of backends) {
    if (remain() < 400) break
    try {
      const res = (await run()).filter((r) => r.title && r.url.startsWith('http'))
      if (res.length > 0) return res.slice(0, maxResults)
    } catch {
      /* try next backend */
    }
  }
  return []
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function searchTavily(
  query: string,
  apiKey: string,
  maxResults: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const res = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
    },
    timeoutMs,
  )
  if (!res.ok) return []
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title || 'Web Result',
    url: r.url || '',
    snippet: (r.content || '').slice(0, 300),
  }))
}

async function searchBrave(
  query: string,
  apiKey: string,
  maxResults: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const res = await fetchWithTimeout(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
    { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' } },
    timeoutMs,
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> }
  }
  return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title || 'Web Result',
    url: r.url || '',
    snippet: (r.description || '').slice(0, 300),
  }))
}

async function searchSearXNG(
  query: string,
  baseUrl: string,
  maxResults: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const url = new URL('/search', baseUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  const res = await fetchWithTimeout(url.toString(), {}, timeoutMs)
  if (!res.ok) return []
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title || 'Web Result',
    url: r.url || '',
    snippet: (r.content || '').slice(0, 300),
  }))
}

async function searchDuckDuckGo(query: string, maxResults: number, timeoutMs: number): Promise<SearchResult[]> {
  const htmlAttempts: Array<() => Promise<string>> = [
    async () => {
      const res = await fetchWithTimeout(
        'https://html.duckduckgo.com/html/',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': USER_AGENT,
          },
          body: new URLSearchParams({ q: query, b: '' }).toString(),
        },
        timeoutMs,
      )
      return res.ok ? await res.text() : ''
    },
    async () => {
      const res = await fetchWithTimeout(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        { headers: { 'user-agent': USER_AGENT } },
        timeoutMs,
      )
      return res.ok ? await res.text() : ''
    },
    async () => {
      const res = await fetchWithTimeout(
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
        { headers: { 'user-agent': USER_AGENT } },
        timeoutMs,
      )
      return res.ok ? await res.text() : ''
    },
  ]

  for (const attempt of htmlAttempts) {
    try {
      const html = await attempt()
      const parsed = parseDuckDuckGoHtml(html, maxResults)
      if (parsed.length > 0) return parsed
    } catch {
      /* next attempt */
    }
  }

  const apiRes = await fetchWithTimeout(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    { headers: { 'user-agent': USER_AGENT } },
    timeoutMs,
  )
  if (!apiRes.ok) return []
  const data = (await apiRes.json().catch(() => null)) as {
    AbstractText?: string
    AbstractURL?: string
    Heading?: string
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>
  } | null
  if (!data) return []
  const results: SearchResult[] = []
  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.AbstractText.slice(0, 300),
    })
  }
  const topics = (data.RelatedTopics || []).flatMap((t) => (t.Topics ? t.Topics : [t]))
  for (const topic of topics) {
    if (results.length >= maxResults) break
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.split(' - ')[0] || query,
        url: topic.FirstURL,
        snippet: topic.Text.slice(0, 300),
      })
    }
  }
  return results
}

export function parseDuckDuckGoHtml(html: string, maxResults: number): SearchResult[] {
  if (!html) return []
  const results: SearchResult[] = []
  const seen = new Set<string>()

  const push = (rawUrl: string, rawTitle: string, rawSnippet: string) => {
    const cleanUrl = decodeDdgUrl(rawUrl)
    const cleanTitle = stripHtml(rawTitle).trim()
    const cleanSnippet = stripHtml(rawSnippet).trim()
    if (!cleanTitle || !cleanUrl.startsWith('http') || seen.has(cleanUrl)) return
    seen.add(cleanUrl)
    results.push({ title: cleanTitle, url: cleanUrl, snippet: cleanSnippet || cleanTitle })
  }

  const blockRegex = /<div class="result__body">([\s\S]*?)<\/div>\s*<\/div>/gi
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(html)) !== null && results.length < maxResults) {
    const block = match[1] ?? ''
    const titleMatch = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    const snippetMatch = /<(?:a|td)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td)>/i.exec(block)
    if (titleMatch) push(titleMatch[1] || '', titleMatch[2] || '', snippetMatch?.[1] || '')
  }

  if (results.length === 0) {
    const liteLink = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippets = [...html.matchAll(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1] || '')
    let i = 0
    while ((match = liteLink.exec(html)) !== null && results.length < maxResults) {
      push(match[1] || '', match[2] || '', snippets[i] || '')
      i++
    }
  }

  if (results.length === 0) {
    const generic = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    while ((match = generic.exec(html)) !== null && results.length < maxResults) {
      push(match[1] || '', match[2] || '', '')
    }
  }

  return results.slice(0, maxResults)
}

export async function searchWikipedia(query: string, maxResults = 5, timeoutMs = 5000): Promise<SearchResult[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
    `&srlimit=${maxResults}&utf8=&format=json&origin=*`
  const res = await fetchWithTimeout(
    url,
    { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } },
    timeoutMs,
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> }
  }
  return (data.query?.search ?? []).slice(0, maxResults).map((r) => {
    const title = r.title || 'Wikipedia'
    return {
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      snippet: stripHtml(r.snippet || '').slice(0, 300),
    }
  })
}

function decodeDdgUrl(rawUrl: string): string {
  let cleanUrl = rawUrl
  if (rawUrl.includes('uddg=')) {
    try {
      const matchUddg = /uddg=([^&]+)/.exec(rawUrl)
      if (matchUddg?.[1]) cleanUrl = decodeURIComponent(matchUddg[1])
    } catch {
      /* keep original */
    }
  }
  if (cleanUrl.startsWith('//')) cleanUrl = `https:${cleanUrl}`
  return cleanUrl
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return ''
  return (
    `=== LIVE WEB RESEARCH & SOURCES ===\n` +
    results.map((r, i) => `[Source ${i + 1}]: "${r.title}"\nURL: ${r.url}\nSummary: ${r.snippet}`).join('\n\n') +
    `\n====================================`
  )
}

export function formatResearchMarkdown(pack: ResearchPack): string {
  const parts: string[] = []
  if (pack.web.length > 0) {
    parts.push(
      `**Live web research**\n\n` +
        pack.web
          .map((r, i) => {
            const img = r.imageUrl ? `\n\n![${r.title}](${r.imageUrl})` : ''
            return `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}${img}`
          })
          .join('\n\n'),
    )
  }
  if (pack.images.length > 0) {
    parts.push(
      `**Images**\n\n` +
        pack.images
          .map((r) => {
            const src = r.imageUrl || r.url
            return `[![${r.title}](${src})](${r.url})`
          })
          .join('\n\n'),
    )
  }
  if (pack.videos.length > 0) {
    parts.push(
      `**Videos**\n\n` +
        pack.videos.map((r) => `- [${r.title}](${r.url})${r.snippet ? ` — ${r.snippet}` : ''}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}

export async function searchWikiImages(query: string, maxResults = 4, timeoutMs = 6000): Promise<SearchResult[]> {
  const headers = { 'user-agent': USER_AGENT, accept: 'application/json' }
  const wikiUrl =
    `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrlimit=${Math.max(maxResults * 2, 8)}&prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=800&format=json`
  const commonsUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrlimit=${maxResults}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`

  const [wikiRes, commonsRes] = await Promise.all([
    fetchWithTimeout(wikiUrl, { headers }, timeoutMs).catch(() => null),
    fetchWithTimeout(commonsUrl, { headers }, timeoutMs).catch(() => null),
  ])

  const out: SearchResult[] = []
  if (wikiRes?.ok) {
    const data = (await wikiRes.json()) as {
      query?: {
        pages?: Record<
          string,
          { title?: string; fullurl?: string; canonicalurl?: string; thumbnail?: { source?: string } }
        >
      }
    }
    for (const p of Object.values(data.query?.pages ?? {})) {
      if (!p.thumbnail?.source) continue
      out.push({
        title: p.title || 'Image',
        url:
          p.fullurl ||
          p.canonicalurl ||
          `https://en.wikipedia.org/wiki/${encodeURIComponent((p.title || '').replace(/ /g, '_'))}`,
        snippet: p.title || '',
        kind: 'image',
        imageUrl: p.thumbnail.source,
      })
    }
  }
  if (out.length < maxResults && commonsRes?.ok) {
    const data = (await commonsRes.json()) as {
      query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ url?: string; thumburl?: string }> }> }
    }
    for (const p of Object.values(data.query?.pages ?? {})) {
      const info = p.imageinfo?.[0]
      const src = info?.thumburl || info?.url
      if (!src) continue
      out.push({
        title: (p.title || 'Image').replace(/^File:/, ''),
        url: src,
        snippet: p.title || '',
        kind: 'image',
        imageUrl: src,
      })
    }
  }
  const seen = new Set<string>()
  return out
    .filter((r) => {
      if (!r.imageUrl || seen.has(r.imageUrl)) return false
      seen.add(r.imageUrl)
      return true
    })
    .slice(0, maxResults)
}

export async function researchTopic(query: string, timeoutMs = 8000): Promise<ResearchPack> {
  const cleanQuery = query.trim().slice(0, 400)
  if (!cleanQuery) return { web: [], images: [], videos: [] }
  const [web, images, videos] = await Promise.all([
    searchWeb(cleanQuery, 5, timeoutMs).catch(() => [] as SearchResult[]),
    searchWikiImages(cleanQuery, 4, timeoutMs).catch(() => [] as SearchResult[]),
    searchDuckDuckGo(`${cleanQuery} site:youtube.com`, 3, timeoutMs)
      .then((rows) => rows.map((r) => ({ ...r, kind: 'video' as const })))
      .catch(() => [] as SearchResult[]),
  ])
  return { web, images, videos }
}
