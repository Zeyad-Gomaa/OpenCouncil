/** Conservative local reservation guard, not a guarantee of provider billing. */
import type { ChatMessage } from '../providers/types.js'

import type { BudgetState } from '@opencouncil/shared'
export class BudgetExceeded extends Error {
  override readonly name = 'BudgetExceeded'
}

export class SpendingBudget {
  readonly state: BudgetState
  constructor(
    limitUsd?: number | null,
    private save: (state: BudgetState) => void = () => {},
    maxAttempts = 200,
  ) {
    this.state = {
      limitUsd: limitUsd ?? null,
      reservedUsd: 0,
      reportedUsd: 0,
      uncertainAttempts: 0,
      attempts: 0,
      maxAttempts,
      stopped: null,
    }
    this.save(this.state)
  }
  assertUsable(): void {
    if (this.state.stopped) throw new BudgetExceeded(this.state.stopped)
  }
  private stop(message: string): never {
    this.state.stopped = message
    this.save(this.state)
    throw new BudgetExceeded(message)
  }
  reserve(
    messages: ChatMessage[],
    maxTokens: number,
    inputPrice: number | null,
    outputPrice: number | null,
  ): (actual: number | null) => void {
    this.assertUsable()
    if (this.state.attempts >= this.state.maxAttempts) this.stop('Provider attempt limit reached (including retries).')
    const priced =
      inputPrice !== null &&
      outputPrice !== null &&
      Number.isFinite(inputPrice) &&
      Number.isFinite(outputPrice) &&
      inputPrice >= 0 &&
      outputPrice >= 0
    if (!priced && this.state.limitUsd !== null) this.stop('Budget requires input and output pricing for every model.')
    // UTF-8 bytes plus envelope allowance intentionally overestimate ordinary text.
    // Hidden provider reasoning, tokenizers, and incorrect configured prices can still differ.
    const inputTokens = messages.reduce((sum, m) => sum + Buffer.byteLength(m.content, 'utf8') + 256, 256)
    const estimate = priced ? (inputTokens * inputPrice + maxTokens * outputPrice) / 1_000_000 : 0
    if (this.state.limitUsd !== null && this.state.reservedUsd + estimate > this.state.limitUsd)
      this.stop('Session estimated USD budget exhausted before the next provider attempt.')
    this.state.reservedUsd += estimate
    this.state.attempts++
    this.state.uncertainAttempts++
    this.save(this.state)
    let settled = false
    return (actual) => {
      if (settled) return
      settled = true
      if (actual !== null && Number.isFinite(actual) && actual >= 0) {
        this.state.uncertainAttempts--
        this.state.reportedUsd += actual
        this.state.reservedUsd += Math.max(0, actual - estimate)
        if (this.state.limitUsd !== null && this.state.reservedUsd > this.state.limitUsd)
          this.state.stopped = 'Reported usage exceeded its reservation; further calls stopped.'
      }
      // Never release a reservation: retries, missing usage and tool hops may still be billed.
      this.save(this.state)
    }
  }
}
