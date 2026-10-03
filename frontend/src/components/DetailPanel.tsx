import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import type { AllocationContext, Ledger } from '../domain/allocation'
import { effectiveUnitPrice } from '../domain/allocation'
import { ANY_SUPPLIER, ANY_WAREHOUSE, lotKey, type ShortfallReason } from '../domain/types'
import { formatDate, formatMoney, formatQty, percent } from '../lib/format'
import { QtyInput } from './QtyInput'
import { Button, ManualBadge, Panel, StatusBadge, TypeBadge } from './primitives'
import { fillStatus } from '../app/useFilteredRows'

const REASON_TEXT: Record<ShortfallReason, string> = {
  FULL: 'Fully allocated.',
  STOCK: 'Short: no stock left in the eligible lots.',
  CREDIT: 'Short: the customer has reached their credit limit.',
  NO_PRICE: 'Cannot allocate: no price configured for this item and supplier.',
  NONE: 'Nothing allocated yet.',
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs text-ink ${mono ? 'nums' : ''}`}>{value}</span>
    </div>
  )
}

export function DetailPanel({
  ctx,
  ledger,
  subOrderId,
  reason,
  onClose,
  onAllocate,
  onAllocateMax,
  onReset,
}: {
  ctx: AllocationContext
  ledger: Ledger
  subOrderId: string | null
  reason: ShortfallReason
  onClose: () => void
  onAllocate: (qty: number) => void
  onAllocateMax: () => void
  onReset: () => void
}) {
  const so = subOrderId ? ctx.subOrderById.get(subOrderId) : undefined

  if (!so) {
    return (
      <Panel className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
        Select a row to inspect its allocation, pricing and remaining limits.
      </Panel>
    )
  }

  const allocation = ledger.allocations.get(so.id)
  const allocated = allocation?.quantity ?? 0
  const status = fillStatus(allocated, so.request)
  const customer = ctx.customerById.get(so.customerId)
  const creditLeft = ledger.creditRemaining.get(so.customerId)
  const isManual = ledger.manual.has(so.id)

  const eligible = (ctx.lotsByItem.get(so.itemId) ?? [])
    .filter(
      (lot) =>
        (so.warehouseId === ANY_WAREHOUSE || lot.warehouseId === so.warehouseId) &&
        (so.supplierId === ANY_SUPPLIER || lot.supplierId === so.supplierId),
    )
    .map((lot) => {
      const key = lotKey(lot.itemId, lot.warehouseId, lot.supplierId)
      return {
        key,
        warehouseId: lot.warehouseId,
        supplierId: lot.supplierId,
        remaining: ledger.stockRemaining.get(key) ?? 0,
        unitPrice: effectiveUnitPrice(ctx, so.itemId, lot.supplierId, so.type),
      }
    })
    .sort((a, b) => b.remaining - a.remaining)

  return (
    <Panel className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium text-ink">{so.id}</h2>
            <TypeBadge type={so.type} />
            {isManual ? <ManualBadge /> : null}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {so.orderId} · {formatDate(so.createdAt)}
          </div>
        </div>
        <IconButton size="small" onClick={onClose} aria-label="Close detail panel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-3">
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted">
              Allocation
            </h3>
            <StatusBadge status={status} />
          </div>
          <Field label="Requested" value={`${formatQty(so.request)} kg`} mono />
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-xs text-muted">Allocated</span>
            <QtyInput
              value={allocated}
              max={so.request}
              onCommit={onAllocate}
              onReset={isManual ? onReset : undefined}
              label={`Allocation for ${so.id}`}
            />
          </div>
          <Field label="Fill" value={`${percent(allocated, so.request).toFixed(1)}%`} mono />
          <Field label="Value" value={`฿${formatMoney(allocation?.value ?? 0)}`} mono />
          <p className="mt-1 text-xs leading-relaxed text-muted">{REASON_TEXT[reason]}</p>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-medium text-muted">
            Customer
          </h3>
          <Field label="Name" value={customer?.name ?? so.customerId} />
          <Field label="ID" value={so.customerId} mono />
          <Field label="Credit limit" value={`฿${formatMoney(customer?.creditLimit ?? 0)}`} mono />
          <Field
            label="Credit left"
            value={creditLeft === undefined ? 'untracked' : `฿${formatMoney(creditLeft)}`}
            mono
          />
        </section>

        {allocation && allocation.parts.length > 0 ? (
          <section>
            <h3 className="mb-1 text-xs font-medium text-muted">
              Drawn from
            </h3>
            <div className="space-y-1">
              {allocation.parts.map((part) => (
                <div
                  key={`${part.warehouseId}|${part.supplierId}`}
                  className="flex items-center justify-between rounded-lg bg-hover px-3 py-2"
                >
                  <div className="text-xs text-ink">
                    {part.warehouseId} · {part.supplierId}
                  </div>
                  <div className="nums text-right text-xs">
                    <div className="text-ink">{formatQty(part.quantity)} kg</div>
                    <div className="text-muted">@ ฿{formatMoney(part.unitPrice)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h3 className="mb-1 text-xs font-medium text-muted">
            Eligible lots
          </h3>
          {eligible.length === 0 ? (
            <p className="text-xs text-muted">No stock lots match this item and routing.</p>
          ) : (
            <div className="space-y-1">
              {eligible.slice(0, 8).map((lot) => (
                <div key={lot.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">
                    {lot.warehouseId} · {lot.supplierId}
                  </span>
                  <span className="nums text-ink">
                    {formatQty(lot.remaining)} kg
                    {lot.unitPrice === undefined ? (
                      <span className="ml-1 text-bad">no price</span>
                    ) : (
                      <span className="ml-1 text-faint">@ ฿{formatMoney(lot.unitPrice)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex gap-2 border-t border-line px-4 py-3">
        <Button variant="primary" onClick={onAllocateMax}>
          Allocate max
        </Button>
        <Button variant="danger" onClick={onReset} disabled={allocated === 0 && !isManual}>
          Clear
        </Button>
      </div>
    </Panel>
  )
}
