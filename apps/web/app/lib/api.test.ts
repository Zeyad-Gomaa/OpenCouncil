import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from './api'

describe('apiGet', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('turns a readiness timeout into an actionable connection error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }),
    )

    const request = apiGet('/auth/status', { timeoutMs: 25 })
    const rejection = expect(request).rejects.toThrow('The OpenCouncil server did not respond')
    await vi.advanceTimersByTimeAsync(25)

    await rejection
  })
})
