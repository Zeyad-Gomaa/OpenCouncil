/** Server base URL for browser calls.
 *
 * Relative on purpose: in production Fastify serves the static UI and the API
 * from one origin, and `next dev` proxies /api to the API port (next.config.js).
 */
export const API = '/api/v1'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('opencouncil:unauthorized'))
    let message = `${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      message = body.error?.message ?? message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${API}${path}`.replace(/\/+$/, '')
  return handle<T>(await fetch(url, { cache: 'no-store' }))
}

export async function apiSend<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(`${API}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  )
}

/** Live provider catalog. POST first so a static GET catch-all cannot swallow it. */
export async function apiCatalog<T>(providerId: string): Promise<T> {
  try {
    return await apiSend<T>(`/providers/${providerId}/discover-models`, 'POST')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/no such API route/i.test(msg)) {
      return await apiGet<T>(`/providers/${providerId}/catalog`)
    }
    throw err
  }
}
