import exampleJson from './example.json' with { type: 'json' }
import {
  ANY_SUPPLIER,
  ANY_WAREHOUSE,
  DEFAULT_TIER_MULTIPLIERS,
  ORDER_TYPES,
  type Customer,
  type Dataset,
  type OrderType,
  type PriceEntry,
  type StockLot,
  type SubOrder,
} from '../domain/types'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface GenerateOptions {
  subOrderCount?: number
  seed?: number
  itemCount?: number
  warehouseCount?: number
  supplierCount?: number
  customerCount?: number
  supplyRatio?: number
}

const JAN_1_2025 = Date.UTC(2025, 0, 1)
const DAY = 86_400_000

export function generateDataset(options: GenerateOptions = {}): Dataset {
  const {
    subOrderCount = 5200,
    seed = 20250101,
    itemCount = 6,
    warehouseCount = 5,
    supplierCount = 5,
    customerCount = 220,
    supplyRatio = 0.62,
  } = options

  const rand = mulberry32(seed)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!
  const between = (min: number, max: number) => min + rand() * (max - min)

  const items = Array.from({ length: itemCount }, (_, i) => `Item-${i + 1}`)
  const warehouses = Array.from({ length: warehouseCount }, (_, i) => `WH-${pad(i + 1)}`)
  const suppliers = Array.from({ length: supplierCount }, (_, i) => `SP-${pad(i + 1)}`)

  const customers: Customer[] = Array.from({ length: customerCount }, (_, i) => ({
    id: `CT-${pad(i + 1, 4)}`,
    name: customerName(i),
    creditLimit: Math.round(between(20_000, 900_000)),
  }))

  const prices: PriceEntry[] = []
  for (const itemId of items) {
    const anchor = between(80, 260)
    for (const supplierId of suppliers) {
      prices.push({
        itemId,
        supplierId,
        price: round2(anchor * between(0.88, 1.2)),
      })
    }
  }

  const subOrders: SubOrder[] = []
  let orderIndex = 0
  while (subOrders.length < subOrderCount) {
    orderIndex += 1
    const orderId = `ORDER-${pad(orderIndex, 4)}`
    const customerId = pick(customers).id
    const type = weightedType(rand)
    const createdAt = JAN_1_2025 + Math.floor(between(0, 120)) * DAY + Math.floor(between(0, DAY))
    const lineCount = Math.min(1 + Math.floor(rand() * 3), subOrderCount - subOrders.length)

    for (let line = 1; line <= lineCount; line += 1) {
      const wildWarehouse = rand() < 0.18
      const wildSupplier = rand() < 0.18
      subOrders.push({
        id: `${orderId}-${pad(line, 3)}`,
        orderId,
        itemId: pick(items),
        warehouseId: wildWarehouse ? ANY_WAREHOUSE : pick(warehouses),
        supplierId: wildSupplier ? ANY_SUPPLIER : pick(suppliers),
        request: round2(between(5, 400)),
        type,
        createdAt,
        customerId,
        remark: type === 'EMERGENCY' && rand() < 0.3 ? 'Special for VIP' : undefined,
      })
    }
  }

  const demandByItem = new Map<string, number>()
  for (const so of subOrders) {
    demandByItem.set(so.itemId, (demandByItem.get(so.itemId) ?? 0) + so.request)
  }

  const stock: StockLot[] = []
  for (const itemId of items) {
    const target = (demandByItem.get(itemId) ?? 0) * supplyRatio
    const weights = warehouses.flatMap((warehouseId) =>
      suppliers.map((supplierId) => ({ warehouseId, supplierId, weight: between(0.2, 1) })),
    )
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
    for (const { warehouseId, supplierId, weight } of weights) {
      stock.push({
        itemId,
        warehouseId,
        supplierId,
        quantity: round2((target * weight) / totalWeight),
      })
    }
  }

  return { subOrders, stock, prices, customers, tierMultipliers: DEFAULT_TIER_MULTIPLIERS }
}

function weightedType(rand: () => number): OrderType {
  const r = rand()
  if (r < 0.12) return 'EMERGENCY'
  if (r < 0.37) return 'OVER_DUE'
  return 'DAILY'
}

function pad(value: number, width = 3): string {
  return String(value).padStart(width, '0')
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

const FIRST = ['Siam', 'Nordic', 'Blue', 'Golden', 'Pacific', 'Royal', 'Fresh', 'Ocean', 'Crystal', 'Arctic']
const SECOND = ['Seafood', 'Foods', 'Market', 'Trading', 'Kitchen', 'Grill', 'Sushi', 'Deli', 'Bistro', 'Export']

function customerName(index: number): string {
  const first = FIRST[index % FIRST.length]
  const second = SECOND[Math.floor(index / FIRST.length) % SECOND.length]
  return `${first} ${second}`
}

export function exampleDataset(): Dataset {
  return exampleJson as Dataset
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  EMERGENCY: 'Emergency',
  OVER_DUE: 'Overdue',
  DAILY: 'Daily',
}

export { ORDER_TYPES }
