import { useCallback, useMemo, useRef, useState } from 'react'
import {
  applyManual,
  autoAllocate,
  buildContext,
  clearManual,
  computeTotals,
  createLedger,
  type AllocationContext,
  type Ledger,
} from '../domain/allocation'
import type { Dataset, ShortfallReason } from '../domain/types'

// ledger is mutated in place; `version` is the render signal. Clone per edit if a caller needs a snapshot.
export function useAllocation(dataset: Dataset) {
  const ctx = useMemo<AllocationContext>(() => buildContext(dataset), [dataset])

  const initial = useMemo(() => autoAllocate(ctx), [ctx])

  const ledgerRef = useRef<Ledger>(initial.ledger)
  const reasonsRef = useRef<Map<string, ShortfallReason>>(initial.reasons)
  const [version, setVersion] = useState(0)

  const seenRef = useRef(initial)
  if (seenRef.current !== initial) {
    seenRef.current = initial
    ledgerRef.current = initial.ledger
    reasonsRef.current = initial.reasons
  }

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const setManual = useCallback(
    (subOrderId: string, quantity: number) => {
      const outcome = applyManual(ctx, ledgerRef.current, subOrderId, quantity)
      if (outcome) {
        reasonsRef.current.set(subOrderId, outcome.reason)
        bump()
      }
      return outcome
    },
    [ctx, bump],
  )

  const resetManual = useCallback(
    (subOrderId: string) => {
      clearManual(ledgerRef.current, subOrderId)
      reasonsRef.current.delete(subOrderId)
      bump()
    },
    [bump],
  )

  const rerunAuto = useCallback(() => {
    const next = autoAllocate(ctx, { preserveManual: ledgerRef.current })
    ledgerRef.current = next.ledger
    reasonsRef.current = next.reasons
    bump()
  }, [ctx, bump])

  const resetAll = useCallback(() => {
    const next = autoAllocate(ctx)
    ledgerRef.current = next.ledger
    reasonsRef.current = next.reasons
    bump()
  }, [ctx, bump])

  const clearAll = useCallback(() => {
    ledgerRef.current = createLedger(ctx)
    reasonsRef.current = new Map()
    bump()
  }, [ctx, bump])

  const totals = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the mutation signal
    () => computeTotals(ctx, ledgerRef.current),
    [ctx, version],
  )

  return {
    ctx,
    ledger: ledgerRef.current,
    reasons: reasonsRef.current,
    version,
    totals,
    setManual,
    resetManual,
    rerunAuto,
    resetAll,
    clearAll,
  }
}
