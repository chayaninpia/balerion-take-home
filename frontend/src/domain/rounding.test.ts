import { describe, expect, it } from 'vitest'
import { bankersRound, maxQtyWithinBudget, roundMoney } from './rounding'

describe('bankersRound', () => {
  it('rounds ties to the even digit', () => {
    expect(bankersRound(1.005)).toBe(1.0)
    expect(bankersRound(1.015)).toBe(1.02)
    expect(bankersRound(1.025)).toBe(1.02)
    expect(bankersRound(1.035)).toBe(1.04)
    expect(bankersRound(2.675)).toBe(2.68)
    expect(bankersRound(0.125)).toBe(0.12)
    expect(bankersRound(0.135)).toBe(0.14)
  })

  it('rounds non-ties normally', () => {
    expect(bankersRound(1.004)).toBe(1.0)
    expect(bankersRound(1.006)).toBe(1.01)
    expect(bankersRound(123.456)).toBe(123.46)
    expect(bankersRound(99.751)).toBe(99.75)
  })

  it('is symmetric about zero', () => {
    expect(bankersRound(-1.005)).toBe(-1.0)
    expect(bankersRound(-1.015)).toBe(-1.02)
    expect(bankersRound(-2.5, 0)).toBe(-2)
    expect(bankersRound(-3.5, 0)).toBe(-4)
  })

  it('honours the requested precision', () => {
    expect(bankersRound(2.5, 0)).toBe(2)
    expect(bankersRound(3.5, 0)).toBe(4)
    expect(bankersRound(1.2345, 3)).toBe(1.234)
    expect(bankersRound(1.2355, 3)).toBe(1.236)
  })

  it('leaves already-rounded and non-finite values alone', () => {
    expect(bankersRound(10)).toBe(10)
    expect(bankersRound(0)).toBe(0)
    expect(bankersRound(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
    expect(Number.isNaN(bankersRound(Number.NaN))).toBe(true)
  })
})

describe('maxQtyWithinBudget', () => {
  it('never produces a value above the budget once rounded', () => {
    const unitPrice = 123.49
    for (const budget of [0, 1, 10, 99.99, 1000, 1234.5, 5000]) {
      const qty = maxQtyWithinBudget(budget, unitPrice)
      expect(roundMoney(qty * unitPrice)).toBeLessThanOrEqual(budget)
    }
  })

  it('spends as much of the budget as a satang allows', () => {
    const qty = maxQtyWithinBudget(1000, 100)
    expect(qty).toBe(10)
  })

  it('treats a free item as unbounded and an empty budget as zero', () => {
    expect(maxQtyWithinBudget(100, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(maxQtyWithinBudget(0, 50)).toBe(0)
    expect(maxQtyWithinBudget(-5, 50)).toBe(0)
  })
})
