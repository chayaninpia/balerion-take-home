import { useMemo } from 'react'
import { compareForAllocation, type AllocationContext, type Ledger } from '../domain/allocation'
import type { OrderType, SubOrder } from '../domain/types'

export type FillStatus = 'FULL' | 'PARTIAL' | 'NONE'
export type SortKey = 'priority' | 'request' | 'allocated' | 'fill' | 'created' | 'id'
export type SortDir = 'asc' | 'desc'

export interface Filters {
  search: string
  types: Set<OrderType>
  statuses: Set<FillStatus>
  warehouseId: string
  supplierId: string
  itemId: string
  manualOnly: boolean
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  types: new Set(),
  statuses: new Set(),
  warehouseId: '',
  supplierId: '',
  itemId: '',
  manualOnly: false,
}

export interface Row {
  subOrder: SubOrder
  allocated: number
  value: number
  status: FillStatus
  isManual: boolean
  customerName: string
}

export function fillStatus(allocated: number, request: number): FillStatus {
  if (allocated <= 0) return 'NONE'
  return allocated >= request ? 'FULL' : 'PARTIAL'
}

// full scan per filter change. Index it if this stops being cheap at the dataset size.
export function useFilteredRows(
  ctx: AllocationContext,
  ledger: Ledger,
  version: number,
  filters: Filters,
  sortKey: SortKey,
  sortDir: SortDir,
): Row[] {
  return useMemo(() => {
    const needle = filters.search.trim().toLowerCase()
    const rows: Row[] = []

    for (const so of ctx.subOrders) {
      if (filters.types.size > 0 && !filters.types.has(so.type)) continue
      if (filters.itemId && so.itemId !== filters.itemId) continue
      if (filters.warehouseId && so.warehouseId !== filters.warehouseId) continue
      if (filters.supplierId && so.supplierId !== filters.supplierId) continue

      const isManual = ledger.manual.has(so.id)
      if (filters.manualOnly && !isManual) continue

      const allocation = ledger.allocations.get(so.id)
      const allocated = allocation?.quantity ?? 0
      const status = fillStatus(allocated, so.request)
      if (filters.statuses.size > 0 && !filters.statuses.has(status)) continue

      const customerName = ctx.customerById.get(so.customerId)?.name ?? so.customerId
      if (needle && !matches(so, customerName, needle)) continue

      rows.push({
        subOrder: so,
        allocated,
        value: allocation?.value ?? 0,
        status,
        isManual,
        customerName,
      })
    }

    rows.sort(comparator(sortKey, sortDir))
    return rows
  }, [ctx, ledger, version, filters, sortKey, sortDir])
}

function matches(so: SubOrder, customerName: string, needle: string): boolean {
  return (
    so.id.toLowerCase().includes(needle) ||
    so.orderId.toLowerCase().includes(needle) ||
    so.customerId.toLowerCase().includes(needle) ||
    customerName.toLowerCase().includes(needle) ||
    so.itemId.toLowerCase().includes(needle) ||
    so.warehouseId.toLowerCase().includes(needle) ||
    so.supplierId.toLowerCase().includes(needle) ||
    (so.remark?.toLowerCase().includes(needle) ?? false)
  )
}

function comparator(key: SortKey, dir: SortDir): (a: Row, b: Row) => number {
  const sign = dir === 'asc' ? 1 : -1

  switch (key) {
    case 'priority':
      return (a, b) => sign * compareForAllocation(a.subOrder, b.subOrder)
    case 'request':
      return (a, b) => sign * (a.subOrder.request - b.subOrder.request)
    case 'allocated':
      return (a, b) => sign * (a.allocated - b.allocated)
    case 'fill':
      return (a, b) => sign * (ratio(a) - ratio(b))
    case 'created':
      return (a, b) => sign * (a.subOrder.createdAt - b.subOrder.createdAt)
    case 'id':
      return (a, b) => sign * (a.subOrder.id < b.subOrder.id ? -1 : a.subOrder.id > b.subOrder.id ? 1 : 0)
  }
}

function ratio(row: Row): number {
  return row.subOrder.request > 0 ? row.allocated / row.subOrder.request : 0
}
