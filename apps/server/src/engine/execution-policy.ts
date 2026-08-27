import { AuthError, ProviderHttpError, RateLimitError, TimeoutError } from '../lib/http.js'

export interface ExecutionPolicy {
  maxRetries: number
  initialBackoffMs: number
  maxBackoffMs: number
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = { maxRetries: 2, initialBackoffMs: 200, maxBackoffMs: 2_000 }

export function isTemporaryProviderError(error: unknown): boolean {
  if (error instanceof AuthError) return false
  if (error instanceof RateLimitError || error instanceof TimeoutError) return true
  return error instanceof ProviderHttpError && (error.status === 408 || error.status === 429 || error.status >= 500)
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
      const base = Math.min(policy.maxBackoffMs, policy.initialBackoffMs * 2 ** retryCount)
      retryCount++
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, base + Math.floor(Math.random() * Math.max(1, base / 4)))
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(new Error('cancelled'))
          },
          { once: true },
        )
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
