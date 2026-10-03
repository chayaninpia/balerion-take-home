const QTY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONEY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const INT = new Intl.NumberFormat('en-US')
const DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

export const formatQty = (value: number): string => QTY.format(value)
export const formatMoney = (value: number): string => MONEY.format(value)
export const formatCompact = (value: number): string => COMPACT.format(value)
export const formatInt = (value: number): string => INT.format(value)
export const formatDate = (epochMs: number): string => DATE.format(epochMs)

export function percent(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, (part / total) * 100))
}
