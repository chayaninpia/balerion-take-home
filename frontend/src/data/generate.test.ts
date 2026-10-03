import { describe, expect, it } from 'vitest'
import { applyManual, autoAllocate, buildContext, computeTotals } from '../domain/allocation'
import { lotKey } from '../domain/types'
import { exampleDataset, generateDataset } from './generate'

const COUNT = 5200

describe('generated dataset', () => {
  const dataset = generateDataset({ subOrderCount: COUNT })

  it('produces the requested number of rows with unique ids', () => {
    expect(dataset.subOrders).toHaveLength(COUNT)
    expect(new Set(dataset.subOrders.map((s) => s.id)).size).toBe(COUNT)
  })

  it('is deterministic for a given seed', () => {
    const a = generateDataset({ subOrderCount: 500, seed: 7 })
    const b = generateDataset({ subOrderCount: 500, seed: 7 })
    expect(a.subOrders).toEqual(b.subOrders)
    expect(a.stock).toEqual(b.stock)

    const c = generateDataset({ subOrderCount: 500, seed: 8 })
    expect(c.subOrders).not.toEqual(a.subOrders)
  })

  it('prices every item/supplier pair that holds stock', () => {
    const priced = new Set(dataset.prices.map((p) => `${p.itemId}|${p.supplierId}`))
    for (const lot of dataset.stock) {
      expect(priced.has(`${lot.itemId}|${lot.supplierId}`)).toBe(true)
    }
  })

  it('leaves demand genuinely contended, so priority rules matter', () => {
    const demand = dataset.subOrders.reduce((sum, s) => sum + s.request, 0)
    const supply = dataset.stock.reduce((sum, s) => sum + s.quantity, 0)
    expect(supply).toBeLessThan(demand)
    expect(supply).toBeGreaterThan(demand * 0.3)
  })
})

describe('full-scale allocation invariants', () => {
  const dataset = generateDataset({ subOrderCount: COUNT })
  const ctx = buildContext(dataset)
  const { ledger } = autoAllocate(ctx)

  it('never draws more than a lot holds', () => {
    const drawn = new Map<string, number>()
    for (const alloc of ledger.allocations.values()) {
      for (const part of alloc.parts) {
        const key = lotKey(alloc.itemId, part.warehouseId, part.supplierId)
        drawn.set(key, (drawn.get(key) ?? 0) + part.quantity)
      }
    }
    for (const lot of dataset.stock) {
      const key = lotKey(lot.itemId, lot.warehouseId, lot.supplierId)
      expect(drawn.get(key) ?? 0).toBeLessThanOrEqual(lot.quantity + 1e-6)
    }
  })

  it('keeps remaining stock non-negative and consistent', () => {
    for (const lot of dataset.stock) {
      const key = lotKey(lot.itemId, lot.warehouseId, lot.supplierId)
      const left = ledger.stockRemaining.get(key) ?? 0
      expect(left).toBeGreaterThanOrEqual(-1e-6)
      expect(left).toBeLessThanOrEqual(lot.quantity + 1e-6)
    }
  })

  it('never exceeds any customer credit limit', () => {
    const spent = new Map<string, number>()
    for (const alloc of ledger.allocations.values()) {
      spent.set(alloc.customerId, (spent.get(alloc.customerId) ?? 0) + alloc.value)
    }
    for (const customer of dataset.customers) {
      expect(spent.get(customer.id) ?? 0).toBeLessThanOrEqual(customer.creditLimit + 1e-6)
      expect(ledger.creditRemaining.get(customer.id) ?? 0).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  it('never allocates more than requested', () => {
    for (const so of dataset.subOrders) {
      const got = ledger.allocations.get(so.id)?.quantity ?? 0
      expect(got).toBeLessThanOrEqual(so.request + 1e-6)
    }
  })

  it('reports every allocated quantity at 2 decimal places', () => {
    for (const alloc of ledger.allocations.values()) {
      expect(alloc.quantity).toBe(Math.round(alloc.quantity * 100) / 100)
      expect(alloc.value).toBe(Math.round(alloc.value * 100) / 100)
    }
  })

  it('fills emergency rows at a higher rate than daily rows', () => {
    const rate = (type: string) => {
      let requested = 0
      let allocated = 0
      for (const so of dataset.subOrders) {
        if (so.type !== type) continue
        requested += so.request
        allocated += ledger.allocations.get(so.id)?.quantity ?? 0
      }
      return requested > 0 ? allocated / requested : 0
    }
    expect(rate('EMERGENCY')).toBeGreaterThan(rate('DAILY'))
    expect(rate('OVER_DUE')).toBeGreaterThan(rate('DAILY'))
  })

  it('part quantities sum to the allocation total', () => {
    for (const alloc of ledger.allocations.values()) {
      const sum = alloc.parts.reduce((s, p) => s + p.quantity, 0)
      expect(Math.abs(sum - alloc.quantity)).toBeLessThan(1e-6)
    }
  })

  it('summarises consistently with the per-row allocations', () => {
    const totals = computeTotals(ctx, ledger)
    expect(totals.fullyFilled + totals.partiallyFilled + totals.unfilled).toBe(COUNT)
    expect(totals.allocated).toBeLessThanOrEqual(totals.requested)
  })
})

describe('performance', () => {
  it('auto-allocates 5,200 sub-orders well inside a page-load budget', () => {
    const dataset = generateDataset({ subOrderCount: COUNT })
    const ctx = buildContext(dataset)

    const start = performance.now()
    autoAllocate(ctx)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1500)
  })

  it('scales to 50,000 sub-orders', () => {
    const dataset = generateDataset({ subOrderCount: 50_000 })
    const ctx = buildContext(dataset)

    const start = performance.now()
    const { ledger } = autoAllocate(ctx)
    const elapsed = performance.now() - start

    expect(ledger.allocations.size).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(6000)
  })

  it('applies a single manual edit in constant time', () => {
    const dataset = generateDataset({ subOrderCount: COUNT })
    const ctx = buildContext(dataset)
    const { ledger } = autoAllocate(ctx)
    const target = dataset.subOrders[1234]!

    const start = performance.now()
    for (let i = 0; i < 200; i += 1) {
      applyManual(ctx, ledger, target.id, (i % 20) + 1)
    }
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(400)
  })
})

describe('spec example dataset', () => {
  const ctx = buildContext(exampleDataset())

  it('prioritises the emergency order over the daily one', () => {
    const { ledger } = autoAllocate(ctx)
    const emergency = ledger.allocations.get('ORDER-0002-001')
    const daily = ledger.allocations.get('ORDER-0001-001')

    expect(emergency?.quantity).toBe(150)
    expect(daily?.quantity).toBe(11)
  })

  it('spans warehouses for the WH-000/SP-000 row', () => {
    const { ledger } = autoAllocate(ctx)
    const wild = ledger.allocations.get('ORDER-0002-002')
    expect(wild).toBeDefined()
    expect(wild?.parts[0]?.warehouseId).toBe('WH-002')
    expect(wild?.quantity).toBe(100)
  })
})
