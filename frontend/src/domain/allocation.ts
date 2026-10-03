import { maxQtyWithinBudget, roundMoney, roundQty } from './rounding'
import {
  ANY_SUPPLIER,
  ANY_WAREHOUSE,
  TYPE_RANK,
  lotKey,
  priceKey,
  type Allocation,
  type AllocationPart,
  type Customer,
  type Dataset,
  type LotKey,
  type ShortfallReason,
  type StockLot,
  type SubOrder,
  type TierMultipliers,
} from './types'

export interface AllocationContext {
  subOrders: SubOrder[]
  subOrderById: Map<string, SubOrder>
  customerById: Map<string, Customer>
  lotsByItem: Map<string, StockLot[]>
  lotByKey: Map<LotKey, StockLot>
  basePrice: Map<string, number>
  tierMultipliers: TierMultipliers
}

export interface Ledger {
  stockRemaining: Map<LotKey, number>
  creditRemaining: Map<string, number>
  allocations: Map<string, Allocation>
  manual: Set<string>
}

export function buildContext(dataset: Dataset): AllocationContext {
  const lotsByItem = new Map<string, StockLot[]>()
  const lotByKey = new Map<LotKey, StockLot>()
  for (const lot of dataset.stock) {
    const list = lotsByItem.get(lot.itemId)
    if (list) list.push(lot)
    else lotsByItem.set(lot.itemId, [lot])
    lotByKey.set(lotKey(lot.itemId, lot.warehouseId, lot.supplierId), lot)
  }

  const basePrice = new Map<string, number>()
  for (const entry of dataset.prices) {
    basePrice.set(priceKey(entry.itemId, entry.supplierId), entry.price)
  }

  const subOrderById = new Map<string, SubOrder>()
  for (const so of dataset.subOrders) subOrderById.set(so.id, so)

  const customerById = new Map<string, Customer>()
  for (const c of dataset.customers) customerById.set(c.id, c)

  return {
    subOrders: dataset.subOrders,
    subOrderById,
    customerById,
    lotsByItem,
    lotByKey,
    basePrice,
    tierMultipliers: dataset.tierMultipliers,
  }
}

export function createLedger(ctx: AllocationContext): Ledger {
  const stockRemaining = new Map<LotKey, number>()
  for (const [key, lot] of ctx.lotByKey) stockRemaining.set(key, lot.quantity)

  const creditRemaining = new Map<string, number>()
  for (const [id, customer] of ctx.customerById) creditRemaining.set(id, customer.creditLimit)

  return {
    stockRemaining,
    creditRemaining,
    allocations: new Map(),
    manual: new Set(),
  }
}

export function effectiveUnitPrice(
  ctx: AllocationContext,
  itemId: string,
  supplierId: string,
  type: SubOrder['type'],
): number | undefined {
  const base = ctx.basePrice.get(priceKey(itemId, supplierId))
  if (base === undefined) return undefined
  return roundMoney(base * ctx.tierMultipliers[type])
}

function candidateLots(ctx: AllocationContext, ledger: Ledger, so: SubOrder): StockLot[] {
  const anyWarehouse = so.warehouseId === ANY_WAREHOUSE
  const anySupplier = so.supplierId === ANY_SUPPLIER

  if (!anyWarehouse && !anySupplier) {
    const lot = ctx.lotByKey.get(lotKey(so.itemId, so.warehouseId, so.supplierId))
    return lot ? [lot] : []
  }

  const pool = ctx.lotsByItem.get(so.itemId)
  if (!pool) return []

  const matches = pool.filter(
    (lot) =>
      (anyWarehouse || lot.warehouseId === so.warehouseId) &&
      (anySupplier || lot.supplierId === so.supplierId),
  )

  if (matches.length > 1) {
    matches.sort((a, b) => {
      const ka = lotKey(a.itemId, a.warehouseId, a.supplierId)
      const kb = lotKey(b.itemId, b.warehouseId, b.supplierId)
      const diff = (ledger.stockRemaining.get(kb) ?? 0) - (ledger.stockRemaining.get(ka) ?? 0)
      return diff !== 0 ? diff : ka < kb ? -1 : 1
    })
  }
  return matches
}

export interface AllocateOutcome {
  allocation: Allocation
  reason: ShortfallReason
}

export function allocateSubOrder(
  ctx: AllocationContext,
  ledger: Ledger,
  so: SubOrder,
  target: number,
): AllocateOutcome {
  release(ledger, so.id)

  const wanted = roundQty(Math.max(0, target))
  const parts: AllocationPart[] = []
  let allocated = 0
  let totalValue = 0

  let blockedByCredit = false
  let sawPrice = false

  const credit = ledger.creditRemaining
  let creditLeft = credit.get(so.customerId)
  // unknown customer is uncapped. Zero them out if missing customers should not allocate.
  const creditTracked = creditLeft !== undefined
  if (creditLeft === undefined) creditLeft = Number.POSITIVE_INFINITY

  for (const lot of candidateLots(ctx, ledger, so)) {
    const remainingNeed = roundQty(wanted - allocated)
    if (remainingNeed <= 0) break

    // price before stock, or a sold-out lot is reported as NO_PRICE.
    const unitPrice = effectiveUnitPrice(ctx, so.itemId, lot.supplierId, so.type)
    if (unitPrice === undefined) continue
    sawPrice = true

    const key = lotKey(lot.itemId, lot.warehouseId, lot.supplierId)
    const lotLeft = ledger.stockRemaining.get(key) ?? 0
    if (lotLeft <= 0) continue

    const affordable = maxQtyWithinBudget(creditLeft, unitPrice)
    const take = roundQty(Math.min(remainingNeed, lotLeft, affordable))
    if (take <= 0) {
      if (affordable < Math.min(remainingNeed, lotLeft)) blockedByCredit = true
      continue
    }
    if (affordable < Math.min(remainingNeed, lotLeft)) blockedByCredit = true

    const partValue = roundMoney(take * unitPrice)
    parts.push({
      warehouseId: lot.warehouseId,
      supplierId: lot.supplierId,
      quantity: take,
      unitPrice,
    })

    ledger.stockRemaining.set(key, roundQty(lotLeft - take))
    allocated = roundQty(allocated + take)
    totalValue = roundMoney(totalValue + partValue)
    creditLeft = roundMoney(creditLeft - partValue)
  }

  if (creditTracked) credit.set(so.customerId, creditLeft)

  const allocation: Allocation = {
    subOrderId: so.id,
    itemId: so.itemId,
    customerId: so.customerId,
    quantity: allocated,
    value: roundMoney(totalValue),
    parts,
  }
  if (allocated > 0) ledger.allocations.set(so.id, allocation)

  return { allocation, reason: shortfallReason(allocated, wanted, blockedByCredit, sawPrice) }
}

function shortfallReason(
  allocated: number,
  wanted: number,
  blockedByCredit: boolean,
  sawPrice: boolean,
): ShortfallReason {
  if (wanted <= 0) return 'NONE'
  if (allocated >= wanted) return 'FULL'
  if (!sawPrice) return 'NO_PRICE'
  return blockedByCredit ? 'CREDIT' : 'STOCK'
}

export function release(ledger: Ledger, subOrderId: string): void {
  const previous = ledger.allocations.get(subOrderId)
  if (!previous) return

  for (const part of previous.parts) {
    const key = lotKey(previous.itemId, part.warehouseId, part.supplierId)
    ledger.stockRemaining.set(key, roundQty((ledger.stockRemaining.get(key) ?? 0) + part.quantity))
  }

  const creditLeft = ledger.creditRemaining.get(previous.customerId)
  if (creditLeft !== undefined) {
    ledger.creditRemaining.set(previous.customerId, roundMoney(creditLeft + previous.value))
  }

  ledger.allocations.delete(subOrderId)
}

export function compareForAllocation(a: SubOrder, b: SubOrder): number {
  const byType = TYPE_RANK[a.type] - TYPE_RANK[b.type]
  if (byType !== 0) return byType
  const byDate = a.createdAt - b.createdAt
  if (byDate !== 0) return byDate
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export interface AutoAllocateResult {
  ledger: Ledger
  reasons: Map<string, ShortfallReason>
}

export function autoAllocate(
  ctx: AllocationContext,
  options: { preserveManual?: Ledger } = {},
): AutoAllocateResult {
  const ledger = createLedger(ctx)
  const reasons = new Map<string, ShortfallReason>()

  const preserved = options.preserveManual
  if (preserved) {
    for (const id of preserved.manual) {
      const so = ctx.subOrderById.get(id)
      const previous = preserved.allocations.get(id)
      if (!so) continue
      ledger.manual.add(id)
      const { reason } = allocateSubOrder(ctx, ledger, so, previous?.quantity ?? 0)
      reasons.set(id, reason)
    }
  }

  const queue = ctx.subOrders.filter((so) => !ledger.manual.has(so.id)).sort(compareForAllocation)

  for (const so of queue) {
    const { reason } = allocateSubOrder(ctx, ledger, so, so.request)
    reasons.set(so.id, reason)
  }

  return { ledger, reasons }
}

export function applyManual(
  ctx: AllocationContext,
  ledger: Ledger,
  subOrderId: string,
  quantity: number,
): AllocateOutcome | undefined {
  const so = ctx.subOrderById.get(subOrderId)
  if (!so) return undefined

  ledger.manual.add(subOrderId)
  return allocateSubOrder(ctx, ledger, so, quantity)
}

export function clearManual(ledger: Ledger, subOrderId: string): void {
  ledger.manual.delete(subOrderId)
  release(ledger, subOrderId)
}

export interface LedgerTotals {
  requested: number
  allocated: number
  value: number
  stockRemaining: number
  fullyFilled: number
  partiallyFilled: number
  unfilled: number
}

export function computeTotals(ctx: AllocationContext, ledger: Ledger): LedgerTotals {
  let requested = 0
  let allocated = 0
  let value = 0
  let fullyFilled = 0
  let partiallyFilled = 0
  let unfilled = 0

  for (const so of ctx.subOrders) {
    requested += so.request
    const got = ledger.allocations.get(so.id)?.quantity ?? 0
    allocated += got
    value += ledger.allocations.get(so.id)?.value ?? 0
    if (got <= 0) unfilled += 1
    else if (got >= so.request) fullyFilled += 1
    else partiallyFilled += 1
  }

  let stockRemaining = 0
  for (const left of ledger.stockRemaining.values()) stockRemaining += left

  return {
    requested: roundQty(requested),
    allocated: roundQty(allocated),
    value: roundMoney(value),
    stockRemaining: roundQty(stockRemaining),
    fullyFilled,
    partiallyFilled,
    unfilled,
  }
}
