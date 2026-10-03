export type OrderType = 'EMERGENCY' | 'OVER_DUE' | 'DAILY'

export const TYPE_RANK: Record<OrderType, number> = {
  EMERGENCY: 0,
  OVER_DUE: 1,
  DAILY: 2,
}

export const ORDER_TYPES: readonly OrderType[] = ['EMERGENCY', 'OVER_DUE', 'DAILY']

export const ANY_WAREHOUSE = 'WH-000'
export const ANY_SUPPLIER = 'SP-000'

export interface SubOrder {
  id: string
  orderId: string
  itemId: string
  warehouseId: string
  supplierId: string
  request: number
  type: OrderType
  createdAt: number
  customerId: string
  remark?: string
}

export interface StockLot {
  itemId: string
  warehouseId: string
  supplierId: string
  quantity: number
}

export interface PriceEntry {
  itemId: string
  supplierId: string
  price: number
}

export type TierMultipliers = Record<OrderType, number>

export const DEFAULT_TIER_MULTIPLIERS: TierMultipliers = {
  EMERGENCY: 1.25,
  OVER_DUE: 1.0,
  DAILY: 0.9,
}

export interface Customer {
  id: string
  name: string
  creditLimit: number
}

export interface Dataset {
  subOrders: SubOrder[]
  stock: StockLot[]
  prices: PriceEntry[]
  customers: Customer[]
  tierMultipliers: TierMultipliers
}

export type LotKey = string

export function lotKey(itemId: string, warehouseId: string, supplierId: string): LotKey {
  return `${itemId}|${warehouseId}|${supplierId}`
}

export function priceKey(itemId: string, supplierId: string): string {
  return `${itemId}|${supplierId}`
}

export interface AllocationPart {
  warehouseId: string
  supplierId: string
  quantity: number
  unitPrice: number
}

export interface Allocation {
  subOrderId: string
  itemId: string
  customerId: string
  quantity: number
  value: number
  parts: AllocationPart[]
}

export type ShortfallReason = 'FULL' | 'STOCK' | 'CREDIT' | 'NO_PRICE' | 'NONE'
