import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthError, httpJson, parseRetryAfter, ProviderHttpError, RateLimitError } from '../lib/http.js'
import { isTemporaryProviderError, Semaphore, withRetry } from '../engine/execution-policy.js'

describe('provider execution policy', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not start HTTP requests with a signal that is already cancelled', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(httpJson('https://example.invalid', { timeoutMs: 1000, signal: AbortSignal.abort() })).rejects.toThrow(
      /cancelled/,
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('parses Retry-After seconds and HTTP dates and carries it on provider errors', async () => {
    expect(parseRetryAfter('2')).toBe(2000)
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:03 GMT', 1000)).toBe(2000)
    expect(parseRetryAfter('nonsense')).toBeUndefined()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '3' } })),
    )
    await expect(httpJson('https://example.invalid', { timeoutMs: 1000 })).rejects.toMatchObject({ retryAfterMs: 3000 })
  })

  it('waits for Retry-After and removes cancellation listeners after retries', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const operation = vi.fn().mockRejectedValueOnce(new RateLimitError('busy', 5000)).mockResolvedValue('ok')
    const result = withRetry(operation, { maxRetries: 1, initialBackoffMs: 1, maxBackoffMs: 1 }, controller.signal)
    await vi.advanceTimersByTimeAsync(4999)
    expect(operation).toHaveBeenCalledTimes(1)
    await vi.runAllTimersAsync()
    await expect(result).resolves.toEqual({ value: 'ok', retryCount: 1 })
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1])
  })

  it('aborts backoff promptly without retrying or leaving a timer', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const operation = vi.fn().mockRejectedValue(new RateLimitError('busy'))
    const result = withRetry(operation, undefined, controller.signal)
    const rejection = expect(result).rejects.toThrow(/cancelled/)
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await rejection
    expect(operation).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
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
