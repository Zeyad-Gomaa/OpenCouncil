import { describe, expect, it } from 'vitest'
import { createEventCursor } from './eventCursor'

describe('SSE resume cursor', () => {
  it('resumes after the newest event and rejects duplicate usage events', () => {
    const cursor = createEventCursor(10)
    expect(cursor.accept('11')).toBe(true)
    expect(cursor.accept('12')).toBe(true)
    expect(cursor.value).toBe(12)
    expect(cursor.accept('11')).toBe(false)
    expect(cursor.accept('12')).toBe(false)
    expect(cursor.accept('13')).toBe(true)
  })
  it('keeps legacy replays while rejecting malformed IDs', () => {
    const cursor = createEventCursor(0)
    expect(cursor.accept('')).toBe(true)
    for (const id of ['NaN', '-1', '1.5', 'Infinity']) expect(cursor.accept(id)).toBe(false)
    expect(cursor.value).toBe(0)
  })
})
