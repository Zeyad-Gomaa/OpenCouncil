import { describe, expect, it } from 'vitest'
import { AuthError, ProviderHttpError, RateLimitError } from '../lib/http.js'
import { isTemporaryProviderError, Semaphore, withRetry } from '../engine/execution-policy.js'

describe('provider execution policy', () => {
  it('retries temporary failures but not authentication failures', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls++
        if (calls < 3) throw new RateLimitError('busy')
        return 'ok'
      },
      { maxRetries: 2, initialBackoffMs: 1, maxBackoffMs: 1 },
    )
    expect(result).toEqual({ value: 'ok', retryCount: 2 })
    expect(isTemporaryProviderError(new ProviderHttpError(503, 'down'))).toBe(true)
    expect(isTemporaryProviderError(new AuthError('bad key'))).toBe(false)
  })

  it('limits concurrent operations', async () => {
    const semaphore = new Semaphore(2)
    let active = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 6 }, () =>
        semaphore.run(async () => {
          active++
          peak = Math.max(peak, active)
          await new Promise((r) => setTimeout(r, 2))
          active--
        }),
      ),
    )
    expect(peak).toBe(2)
  })
})
