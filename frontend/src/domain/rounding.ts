// half-to-even via the decimal string. `value * 10 ** dp` mis-rounds midpoints (1.005 * 100).
export function bankersRound(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return value

  const scaled = scaleByPowerOfTen(value, dp)
  const floor = Math.floor(scaled)
  const diff = scaled - floor

  let rounded: number
  if (diff > 0.5) {
    rounded = floor + 1
  } else if (diff < 0.5) {
    rounded = floor
  } else {
    rounded = floor % 2 === 0 ? floor : floor + 1
  }

  return rounded / 10 ** dp
}

function scaleByPowerOfTen(value: number, dp: number): number {
  const asString = value.toString()
  if (asString.includes('e') || asString.includes('E')) {
    // scientific notation skips the string shift. Parse the exponent if magnitudes leave this range.
    return value * 10 ** dp
  }

  const negative = asString.startsWith('-')
  const unsigned = negative ? asString.slice(1) : asString
  const [intPart = '', fracPart = ''] = unsigned.split('.')

  const digits = intPart + fracPart
  const pointAt = intPart.length + dp

  let shifted: string
  if (pointAt >= digits.length) {
    shifted = digits + '0'.repeat(pointAt - digits.length)
  } else {
    shifted = `${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`
  }

  const result = Number(shifted || '0')
  return negative ? -result : result
}

export function roundMoney(value: number): number {
  return bankersRound(value, 2)
}

export function roundQty(value: number): number {
  return bankersRound(value, 2)
}

export function maxQtyWithinBudget(budget: number, unitPrice: number): number {
  if (unitPrice <= 0) return Number.POSITIVE_INFINITY
  if (budget <= 0) return 0

  let qty = bankersRound(budget / unitPrice, 2)
  while (qty > 0 && roundMoney(qty * unitPrice) > budget) {
    qty = bankersRound(qty - 0.01, 2)
  }
  return Math.max(0, qty)
}
