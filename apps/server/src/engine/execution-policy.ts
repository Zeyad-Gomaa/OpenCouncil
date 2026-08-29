import { AuthError, ProviderHttpError, RateLimitError, TimeoutError } from '../lib/http.js'

export interface ExecutionPolicy {
  maxRetries: number
  initialBackoffMs: number
  maxBackoffMs: number
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = { maxRetries: 3, initialBackoffMs: 1_000, maxBackoffMs: 8_000 }

export function isTemporaryProviderError(error: unknown): boolean {
  if (error instanceof AuthError) return false
  if (error instanceof RateLimitError || error instanceof TimeoutError) return true
  if (error instanceof ProviderHttpError) {
    if (error.status === 408 || error.status === 429 || error.status >= 500) return true
    // OpenRouter returns 404 when an upstream provider (e.g. Nvidia) is temporarily down or unreachable
    if (
      error.status === 404 &&
      (error.body?.includes('Provider returned error') || error.message.includes('Provider returned error'))
    ) {
      return true
    }
  }
  return false
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  policy = DEFAULT_EXECUTION_POLICY,
  signal?: AbortSignal,
): Promise<{ value: T; retryCount: number }> {
  let retryCount = 0
  for (;;) {
    if (signal?.aborted) throw new Error('cancelled')
    try {
      return { value: await operation(), retryCount }
    } catch (error) {
      if (retryCount >= policy.maxRetries || !isTemporaryProviderError(error) || signal?.aborted)
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { retryCount })
      const retryAfter =
        error instanceof RateLimitError || error instanceof ProviderHttpError ? error.retryAfterMs : undefined
      // Do not retry earlier than a provider requests; very long waits fail this turn.
      if (retryAfter != null && retryAfter > 60_000)
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { retryCount })
      const base = Math.max(retryAfter ?? 0, Math.min(policy.maxBackoffMs, policy.initialBackoffMs * 2 ** retryCount))
      retryCount++
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer)
          reject(Object.assign(new Error('cancelled'), { retryCount }))
        }
        const timer = setTimeout(
          () => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
          },
          base + Math.floor(Math.random() * Math.max(1, base / 4)),
        )
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }
}

export class Semaphore {
  private active = 0
  private waiters: Array<() => void> = []
  constructor(private readonly limit: number) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiters.push(resolve))
    this.active++
    try {
      return await operation()
    } finally {
      this.active--
      this.waiters.shift()?.()
    }
  }
}
