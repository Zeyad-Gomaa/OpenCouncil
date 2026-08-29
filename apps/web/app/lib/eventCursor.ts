/** Track durable SSE IDs across manually recreated EventSource connections. */
export function createEventCursor(initial: number) {
  let last = initial
  return {
    get value() {
      return last
    },
    accept(rawId: string): boolean {
      // Legacy message.replay events have no ID and are deduplicated by message ID.
      if (!rawId) return true
      const next = Number(rawId)
      if (!Number.isSafeInteger(next) || next <= last) return false
      last = next
      return true
    },
  }
}
