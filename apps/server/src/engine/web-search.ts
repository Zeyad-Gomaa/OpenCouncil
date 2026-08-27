/** Web search provider: multi-backend search with zero-config DuckDuckGo fallback. */

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/**
 * Searches the web using the best available provider:
 * 1. Tavily (if TAVILY_API_KEY is set)
 * 2. Brave (if BRAVE_API_KEY is set)
 * 3. SearXNG (if SEARXNG_URL is set)
 * 4. DuckDuckGo HTML / Lite (built-in, zero-config, free)
 */
export async function searchWeb(query: string, maxResults = 5, timeoutMs = 8000): Promise<SearchResult[]> {
  const cleanQuery = query.trim().slice(0, 400)
  if (!cleanQuery) return []

  // 1. Tavily API
  if (process.env.TAVILY_API_KEY) {
    try {
      const res = await searchTavily(cleanQuery, process.env.TAVILY_API_KEY, maxResults, timeoutMs)
      if (res.length > 0) return res
    } catch {
      // fallback to next
    }
  }

  // 2. Brave Search API
  if (process.env.BRAVE_API_KEY) {
    try {
      const res = await searchBrave(cleanQuery, process.env.BRAVE_API_KEY, maxResults, timeoutMs)
      if (res.length > 0) return res
    } catch {
      // fallback to next
    }
  }

  // 3. SearXNG
  if (process.env.SEARXNG_URL) {
    try {
      const res = await searchSearXNG(cleanQuery, process.env.SEARXNG_URL, maxResults, timeoutMs)
      if (res.length > 0) return res
    } catch {
      // fallback to next
    }
  }

  // 4. Built-in zero-config DuckDuckGo
  try {
    return await searchDuckDuckGo(cleanQuery, maxResults, timeoutMs)
  } catch {
    return []
  }
}

async function searchTavily(
  query: string,
  apiKey: string,
  maxResults: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
      signal: controller.signal,
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
    return (data.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title || 'Web Result',
      url: r.url || '',
      snippet: (r.content || '').slice(0, 300),
    }))
  } finally {
    clearTimeout(timer)
  }
}

async function searchBrave(
  query: string,
  apiKey: string,
  maxResults: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
      {
        headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
        signal: controller.signal,
      },
    )
    if (!res.ok) return []
    const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
    return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title || 'Web Result',
      url: r.url || '',
      snippet: (r.description || '').slice(0, 300),
    }))
  } finally {
    clearTimeout(timer)
  }
}

async function searchSearXNG(
  query: string,
  baseUrl: string,
  maxResults: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = new URL('/search', baseUrl)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
    return (data.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title || 'Web Result',
      url: r.url || '',
      snippet: (r.content || '').slice(0, 300),
    }))
  } finally {
    clearTimeout(timer)
  }
}

async function searchDuckDuckGo(query: string, maxResults: number, timeoutMs: number): Promise<SearchResult[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Use DuckDuckGo HTML endpoint
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': USER_AGENT,
      },
      body: new URLSearchParams({ q: query, b: '' }).toString(),
      signal: controller.signal,
    })

    if (!res.ok) return []
    const html = await res.text()
    const results: SearchResult[] = []

    // Match each result block in DuckDuckGo HTML
    // Classes: result__snippet, result__url, result__title
    const blockRegex = /<div class="result__body">([\s\S]*?)<\/div>\s*<\/div>/gi
    let match: RegExpExecArray | null

    while ((match = blockRegex.exec(html)) !== null && results.length < maxResults) {
      const block = match[1] ?? ''

      // Title & URL
      const titleMatch = /<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
      const linkMatch = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)

      // Snippet
      const snippetMatch = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block)

      const rawUrl = linkMatch?.[1] || titleMatch?.[1] || ''
      const rawTitle = linkMatch?.[2] || titleMatch?.[2] || ''
      const rawSnippet = snippetMatch?.[1] || ''

      // Decode DDG redirect URL if applicable (e.g. //duckduckgo.com/l/?uddg=https%3A%2F%2F...)
      let cleanUrl = rawUrl
      if (rawUrl.includes('uddg=')) {
        try {
          const matchUddg = /uddg=([^&]+)/.exec(rawUrl)
          if (matchUddg && matchUddg[1]) {
            cleanUrl = decodeURIComponent(matchUddg[1])
          }
        } catch {
          // ignore
        }
      }

      const cleanTitle = stripHtml(rawTitle).trim()
      const cleanSnippet = stripHtml(rawSnippet).trim()

      if (cleanTitle && cleanSnippet && cleanUrl.startsWith('http')) {
        results.push({
          title: cleanTitle,
          url: cleanUrl,
          snippet: cleanSnippet,
        })
      }
    }

    // If HTML parser found results, return them
    if (results.length > 0) return results

    // Fallback: DuckDuckGo Instant Answer API
    const apiRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      {
        headers: { 'user-agent': USER_AGENT },
        signal: controller.signal,
      },
    )
    if (apiRes.ok) {
      const data = (await apiRes.json()) as {
        AbstractText?: string
        AbstractURL?: string
        Heading?: string
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
      }
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText.slice(0, 300),
        })
      }
      for (const topic of data.RelatedTopics || []) {
        if (results.length >= maxResults) break
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || query,
            url: topic.FirstURL,
            snippet: topic.Text.slice(0, 300),
          })
        }
      }
    }

    return results
  } finally {
    clearTimeout(timer)
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return ''
  return (
    `=== LIVE WEB RESEARCH & SOURCES ===\n` +
    results
      .map(
        (r, i) =>
          `[Source ${i + 1}]: "${r.title}"\nURL: ${r.url}\nSummary: ${r.snippet}`,
      )
      .join('\n\n') +
    `\n====================================`
  )
}
