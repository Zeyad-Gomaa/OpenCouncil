/** Server base URL for browser calls.
 *
 * Relative on purpose: in production Fastify serves the static UI and the API
 * from one origin, and `next dev` proxies /api to the API port (next.config.js).
 */
export const API = '/api/v1'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
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
  return handle<T>(await fetch(`${API}${path}`, { cache: 'no-store' }))
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
