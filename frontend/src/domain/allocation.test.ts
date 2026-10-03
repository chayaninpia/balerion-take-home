import { describe, expect, it } from 'vitest'
import {
  applyManual,
  autoAllocate,
  buildContext,
  clearManual,
  compareForAllocation,
  computeTotals,
  effectiveUnitPrice,
} from './allocation'
import { DEFAULT_TIER_MULTIPLIERS, type Dataset, type OrderType, type SubOrder } from './types'

const DAY = 86_400_000
const JAN1 = Date.UTC(2025, 0, 1)

function subOrder(overrides: Partial<SubOrder> & Pick<SubOrder, 'id'>): SubOrder {
  return {
    orderId: overrides.id.split('-').slice(0, 2).join('-'),
    itemId: 'Item-1',
    warehouseId: 'WH-001',
    supplierId: 'SP-001',
    request: 10,
    type: 'DAILY',
    createdAt: JAN1,
    customerId: 'CT-0001',
    ...overrides,
  }
}

function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    subOrders: [],
    stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 1000 }],
    prices: [{ itemId: 'Item-1', supplierId: 'SP-001', price: 100 }],
    customers: [{ id: 'CT-0001', name: 'Alice', creditLimit: 1_000_000 }],
    tierMultipliers: DEFAULT_TIER_MULTIPLIERS,
    ...overrides,
  }
}

describe('effectiveUnitPrice', () => {
  it('applies the order type tier to the supplier base price', () => {
    const ctx = buildContext(dataset({ prices: [{ itemId: 'Item-1', supplierId: 'SP-001', price: 123.49 }] }))
    expect(effectiveUnitPrice(ctx, 'Item-1', 'SP-001', 'EMERGENCY')).toBe(154.36)
    expect(effectiveUnitPrice(ctx, 'Item-1', 'SP-001', 'OVER_DUE')).toBe(123.49)
    expect(effectiveUnitPrice(ctx, 'Item-1', 'SP-001', 'DAILY')).toBe(111.14)
  })

  it('is undefined when the item/supplier pair has no price', () => {
    const ctx = buildContext(dataset())
    expect(effectiveUnitPrice(ctx, 'Item-1', 'SP-999', 'DAILY')).toBeUndefined()
    expect(effectiveUnitPrice(ctx, 'Item-9', 'SP-001', 'DAILY')).toBeUndefined()
  })
})

describe('compareForAllocation', () => {
  it('orders by type, then oldest first, then id', () => {
    const types: OrderType[] = ['DAILY', 'EMERGENCY', 'OVER_DUE']
    const rows = types.map((type, i) => subOrder({ id: `ORDER-000${i}-001`, type }))
    const sorted = [...rows].sort(compareForAllocation).map((r) => r.type)
    expect(sorted).toEqual(['EMERGENCY', 'OVER_DUE', 'DAILY'])

    const sameType = [
      subOrder({ id: 'B', createdAt: JAN1 + DAY }),
      subOrder({ id: 'A', createdAt: JAN1 + DAY }),
      subOrder({ id: 'C', createdAt: JAN1 }),
    ]
    expect([...sameType].sort(compareForAllocation).map((r) => r.id)).toEqual(['C', 'A', 'B'])
  })
})

describe('autoAllocate priority', () => {
  it('fills emergency before overdue before daily when stock is scarce', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 25 }],
        subOrders: [
          subOrder({ id: 'daily', type: 'DAILY', request: 10 }),
          subOrder({ id: 'emergency', type: 'EMERGENCY', request: 10 }),
          subOrder({ id: 'overdue', type: 'OVER_DUE', request: 10 }),
        ],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    expect(ledger.allocations.get('emergency')?.quantity).toBe(10)
    expect(ledger.allocations.get('overdue')?.quantity).toBe(10)
    expect(ledger.allocations.get('daily')?.quantity).toBe(5)
  })

  it('uses FIFO within the same type', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 15 }],
        subOrders: [
          subOrder({ id: 'newer', createdAt: JAN1 + DAY, request: 10 }),
          subOrder({ id: 'older', createdAt: JAN1, request: 10 }),
        ],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    expect(ledger.allocations.get('older')?.quantity).toBe(10)
    expect(ledger.allocations.get('newer')?.quantity).toBe(5)
  })

  it('never exceeds available stock in total', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 7 }],
        subOrders: Array.from({ length: 5 }, (_, i) => subOrder({ id: `so-${i}`, request: 10 })),
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const total = [...ledger.allocations.values()].reduce((sum, a) => sum + a.quantity, 0)
    expect(total).toBe(7)
    expect(ledger.stockRemaining.get('Item-1|WH-001|SP-001')).toBe(0)
  })
})

describe('credit limits', () => {
  it('caps allocation at the customer credit limit', () => {
    const ctx = buildContext(
      dataset({
        customers: [{ id: 'CT-0001', name: 'Alice', creditLimit: 500 }],
        subOrders: [subOrder({ id: 'so-1', request: 100 })],
      }),
    )
    const { ledger, reasons } = autoAllocate(ctx)
    const alloc = ledger.allocations.get('so-1')
    expect(alloc?.quantity).toBe(5.55)
    expect(alloc?.value).toBeLessThanOrEqual(500)
    expect(alloc?.value).toBe(499.5)
    expect(reasons.get('so-1')).toBe('CREDIT')
  })

  it('shares one credit limit across a customer many orders', () => {
    const ctx = buildContext(
      dataset({
        customers: [{ id: 'CT-0001', name: 'Alice', creditLimit: 900 }],
        subOrders: [
          subOrder({ id: 'so-1', request: 5 }),
          subOrder({ id: 'so-2', request: 5 }),
          subOrder({ id: 'so-3', request: 5 }),
        ],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const spent = [...ledger.allocations.values()].reduce((sum, a) => sum + a.value, 0)
    expect(spent).toBeLessThanOrEqual(900)
    expect(ledger.allocations.get('so-1')?.quantity).toBe(5)
    expect(ledger.allocations.get('so-2')?.quantity).toBe(5)
    expect(ledger.creditRemaining.get('CT-0001')).toBe(0)
  })

  it('keeps separate customers independent', () => {
    const ctx = buildContext(
      dataset({
        customers: [
          { id: 'CT-0001', name: 'Alice', creditLimit: 450 },
          { id: 'CT-0002', name: 'Bob', creditLimit: 450 },
        ],
        subOrders: [
          subOrder({ id: 'a', customerId: 'CT-0001', request: 10 }),
          subOrder({ id: 'b', customerId: 'CT-0002', request: 10 }),
        ],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    expect(ledger.allocations.get('a')?.quantity).toBe(5)
    expect(ledger.allocations.get('b')?.quantity).toBe(5)
  })
})

describe('wildcard warehouse and supplier', () => {
  it('draws from the lot with the most stock first', () => {
    const ctx = buildContext(
      dataset({
        stock: [
          { itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 10 },
          { itemId: 'Item-1', warehouseId: 'WH-002', supplierId: 'SP-001', quantity: 50 },
          { itemId: 'Item-1', warehouseId: 'WH-003', supplierId: 'SP-001', quantity: 30 },
        ],
        subOrders: [subOrder({ id: 'so-1', warehouseId: 'WH-000', request: 20 })],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const parts = ledger.allocations.get('so-1')?.parts ?? []
    expect(parts).toHaveLength(1)
    expect(parts[0]?.warehouseId).toBe('WH-002')
    expect(parts[0]?.quantity).toBe(20)
  })

  it('spans multiple lots when one cannot cover the request', () => {
    const ctx = buildContext(
      dataset({
        stock: [
          { itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 30 },
          { itemId: 'Item-1', warehouseId: 'WH-002', supplierId: 'SP-001', quantity: 50 },
        ],
        subOrders: [subOrder({ id: 'so-1', warehouseId: 'WH-000', request: 70 })],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const alloc = ledger.allocations.get('so-1')
    expect(alloc?.quantity).toBe(70)
    expect(alloc?.parts.map((p) => [p.warehouseId, p.quantity])).toEqual([
      ['WH-002', 50],
      ['WH-001', 20],
    ])
  })

  it('prices each part by the supplier it came from', () => {
    const ctx = buildContext(
      dataset({
        stock: [
          { itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 10 },
          { itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-002', quantity: 20 },
        ],
        prices: [
          { itemId: 'Item-1', supplierId: 'SP-001', price: 100 },
          { itemId: 'Item-1', supplierId: 'SP-002', price: 200 },
        ],
        subOrders: [subOrder({ id: 'so-1', supplierId: 'SP-000', type: 'OVER_DUE', request: 25 })],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const alloc = ledger.allocations.get('so-1')
    expect(alloc?.parts).toEqual([
      { warehouseId: 'WH-001', supplierId: 'SP-002', quantity: 20, unitPrice: 200 },
      { warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 5, unitPrice: 100 },
    ])
    expect(alloc?.value).toBe(4500)
  })

  it('restricts a concrete warehouse to its own lots', () => {
    const ctx = buildContext(
      dataset({
        stock: [
          { itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 5 },
          { itemId: 'Item-1', warehouseId: 'WH-002', supplierId: 'SP-001', quantity: 500 },
        ],
        subOrders: [subOrder({ id: 'so-1', warehouseId: 'WH-001', request: 100 })],
      }),
    )
    const { ledger, reasons } = autoAllocate(ctx)
    expect(ledger.allocations.get('so-1')?.quantity).toBe(5)
    expect(reasons.get('so-1')).toBe('STOCK')
  })
})

describe('missing price data', () => {
  it('allocates nothing and reports NO_PRICE', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-009', quantity: 100 }],
        subOrders: [subOrder({ id: 'so-1', supplierId: 'SP-009' })],
      }),
    )
    const { ledger, reasons } = autoAllocate(ctx)
    expect(ledger.allocations.get('so-1')).toBeUndefined()
    expect(reasons.get('so-1')).toBe('NO_PRICE')
  })
})

describe('manual allocation', () => {
  it('rejects more than the remaining stock', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 40 }],
        subOrders: [subOrder({ id: 'so-1', request: 100 })],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const outcome = applyManual(ctx, ledger, 'so-1', 999)
    expect(outcome?.allocation.quantity).toBe(40)
    expect(outcome?.reason).toBe('STOCK')
  })

  it('rejects more than the customer credit allows', () => {
    const ctx = buildContext(
      dataset({
        customers: [{ id: 'CT-0001', name: 'Alice', creditLimit: 450 }],
        subOrders: [subOrder({ id: 'so-1', request: 100 })],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const outcome = applyManual(ctx, ledger, 'so-1', 100)
    expect(outcome?.allocation.quantity).toBe(5)
    expect(outcome?.allocation.value).toBeLessThanOrEqual(450)
  })

  it('returns stock and credit when an allocation is lowered', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 100 }],
        customers: [{ id: 'CT-0001', name: 'Alice', creditLimit: 9000 }],
        subOrders: [subOrder({ id: 'so-1', request: 100 })],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    expect(ledger.stockRemaining.get('Item-1|WH-001|SP-001')).toBe(0)

    applyManual(ctx, ledger, 'so-1', 30)
    expect(ledger.stockRemaining.get('Item-1|WH-001|SP-001')).toBe(70)
    expect(ledger.creditRemaining.get('CT-0001')).toBe(9000 - 30 * 90)
  })

  it('is idempotent when applied repeatedly', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 100 }],
        customers: [{ id: 'CT-0001', name: 'Alice', creditLimit: 100_000 }],
        subOrders: [subOrder({ id: 'so-1', request: 50 })],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    for (let i = 0; i < 25; i += 1) applyManual(ctx, ledger, 'so-1', 20)

    expect(ledger.allocations.get('so-1')?.quantity).toBe(20)
    expect(ledger.stockRemaining.get('Item-1|WH-001|SP-001')).toBe(80)
    expect(ledger.creditRemaining.get('CT-0001')).toBe(100_000 - 20 * 90)
  })

  it('frees everything when cleared', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 100 }],
        subOrders: [subOrder({ id: 'so-1', request: 40 })],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    clearManual(ledger, 'so-1')
    expect(ledger.allocations.get('so-1')).toBeUndefined()
    expect(ledger.stockRemaining.get('Item-1|WH-001|SP-001')).toBe(100)
    expect(ledger.creditRemaining.get('CT-0001')).toBe(1_000_000)
  })

  it('treats a negative entry as zero', () => {
    const ctx = buildContext(dataset({ subOrders: [subOrder({ id: 'so-1', request: 10 })] }))
    const { ledger } = autoAllocate(ctx)
    const outcome = applyManual(ctx, ledger, 'so-1', -5)
    expect(outcome?.allocation.quantity).toBe(0)
  })

  it('is capped by stock already claimed by higher-priority rows', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 30 }],
        subOrders: [
          subOrder({ id: 'low', type: 'DAILY', request: 20 }),
          subOrder({ id: 'high', type: 'EMERGENCY', request: 30 }),
        ],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const outcome = applyManual(ctx, ledger, 'low', 12)
    expect(outcome?.allocation.quantity).toBe(0)
    expect(outcome?.reason).toBe('STOCK')
  })

  it('keeps manual rows untouched when auto-assign re-runs', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 30 }],
        subOrders: [
          subOrder({ id: 'pinned', type: 'DAILY', request: 20 }),
          subOrder({ id: 'auto', type: 'EMERGENCY', request: 30 }),
        ],
      }),
    )
    const first = autoAllocate(ctx)
    clearManual(first.ledger, 'auto')
    applyManual(ctx, first.ledger, 'pinned', 12)

    const second = autoAllocate(ctx, { preserveManual: first.ledger })
    expect(second.ledger.manual.has('pinned')).toBe(true)
    expect(second.ledger.allocations.get('pinned')?.quantity).toBe(12)
    expect(second.ledger.allocations.get('auto')?.quantity).toBe(18)
  })
})

describe('computeTotals', () => {
  it('summarises fill status and never over-allocates', () => {
    const ctx = buildContext(
      dataset({
        stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 15 }],
        subOrders: [
          subOrder({ id: 'a', request: 10 }),
          subOrder({ id: 'b', request: 10 }),
          subOrder({ id: 'c', request: 10 }),
        ],
      }),
    )
    const { ledger } = autoAllocate(ctx)
    const totals = computeTotals(ctx, ledger)
    expect(totals).toMatchObject({
      requested: 30,
      allocated: 15,
      stockRemaining: 0,
      fullyFilled: 1,
      partiallyFilled: 1,
      unfilled: 1,
    })
    expect(totals.allocated).toBeLessThanOrEqual(15)
  })
})

describe('example data from the spec', () => {
  const spec = buildContext({
    subOrders: [
      subOrder({
        id: 'ORDER-0001-001',
        orderId: 'ORDER-0001',
        itemId: 'Item-1',
        warehouseId: 'WH-001',
        supplierId: 'SP-001',
        request: 11,
        type: 'DAILY',
        createdAt: Date.UTC(2025, 0, 1),
        customerId: 'CT-0001',
      }),
      subOrder({
        id: 'ORDER-0002-001',
        orderId: 'ORDER-0002',
        itemId: 'Item-1',
        warehouseId: 'WH-001',
        supplierId: 'SP-001',
        request: 300,
        type: 'EMERGENCY',
        createdAt: Date.UTC(2025, 0, 3),
        customerId: 'CT-0002',
      }),
    ],
    stock: [{ itemId: 'Item-1', warehouseId: 'WH-001', supplierId: 'SP-001', quantity: 200 }],
    prices: [{ itemId: 'Item-1', supplierId: 'SP-001', price: 123.49 }],
    customers: [
      { id: 'CT-0001', name: 'Alice', creditLimit: 1_000_000 },
      { id: 'CT-0002', name: 'Bob', creditLimit: 1_000_000 },
    ],
    tierMultipliers: DEFAULT_TIER_MULTIPLIERS,
  })

  it('gives the emergency order the stock, at the 125% tier', () => {
    const { ledger } = autoAllocate(spec)
    const emergency = ledger.allocations.get('ORDER-0002-001')
    expect(emergency?.quantity).toBe(200)
    expect(emergency?.parts[0]?.unitPrice).toBe(154.36)
    expect(ledger.allocations.get('ORDER-0001-001')).toBeUndefined()
  })
})
