/** Minimal typed fetch helper with timeout + typed provider errors. */

export class AuthError extends Error {
  override name = 'AuthError'
}
export class RateLimitError extends Error {
  override name = 'RateLimitError'
  constructor(
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message)
  }
}
export class TimeoutError extends Error {
  override name = 'TimeoutError'
}
export class ProviderHttpError extends Error {
  constructor(
    public status: number,
    public body: string,
    public retryAfterMs?: number,
  ) {
    super(`provider HTTP ${status}: ${body.slice(0, 300)}`)
    this.name = 'ProviderHttpError'
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

export async function httpJson<T>(
  url: string,
  opts: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
    timeoutMs: number
    signal?: AbortSignal
  },
): Promise<T> {
  if (opts.signal?.aborted) throw new TimeoutError('session cancelled')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new TimeoutError('provider request timed out')), opts.timeoutMs)
  const onOuterAbort = () => controller.abort(new TimeoutError('session cancelled'))
  opts.signal?.addEventListener('abort', onOuterAbort, { once: true })

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'POST',
      headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    })
    if (res.status === 401 || res.status === 403) throw new AuthError(`provider rejected credentials (${res.status})`)
    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'))
    if (res.status === 429) throw new RateLimitError('provider rate limit hit', retryAfterMs)
    if (!res.ok) throw new ProviderHttpError(res.status, await res.text().catch(() => ''), retryAfterMs)
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // Distinguish outer cancel vs our timeout by cause
      if (opts.signal?.aborted) throw new TimeoutError('cancelled')
      throw new TimeoutError('provider request timed out')
    }
    throw err
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onOuterAbort)
  }
}
