import { describe, expect, it } from 'vitest'
import { BudgetExceeded, SpendingBudget } from '../engine/spending-budget.js'

describe('spending reservations', () => {
  it('reserves before dispatch and never releases uncertain charges', () => {
    const states: number[] = []
    const budget = new SpendingBudget(1, (s) => states.push(s.reservedUsd))
    const settle = budget.reserve([{ role: 'user', content: 'hello' }], 1000, 100, 100)
    const reserved = budget.state.reservedUsd
    settle(null)
    expect(budget.state.reservedUsd).toBe(reserved)
    expect(budget.state.uncertainAttempts).toBe(1)
    expect(states.length).toBeGreaterThan(1)
  })
  it('fails closed for missing prices and caps aggregate parallel reservations', () => {
    const unpriced = new SpendingBudget(1)
    expect(() => unpriced.reserve([], 100, null, 1)).toThrow(BudgetExceeded)
    const budget = new SpendingBudget(0.0001)
    expect(() => budget.reserve([{ role: 'user', content: 'x' }], 1000, 100, 100)).toThrow(BudgetExceeded)
  })
  it('limits provider attempts including retries', () => {
    const budget = new SpendingBudget(null, undefined, 1)
    budget.reserve([], 1, null, null)
    expect(() => budget.reserve([], 1, null, null)).toThrow(/attempt limit/i)
  })
})
