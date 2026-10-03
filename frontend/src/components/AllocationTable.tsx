import TablePagination from '@mui/material/TablePagination'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Row, SortDir, SortKey } from '../app/useFilteredRows'
import type { ShortfallReason } from '../domain/types'
import { ANY_SUPPLIER, ANY_WAREHOUSE } from '../domain/types'
import { formatDate, formatInt, formatMoney, formatQty, percent } from '../lib/format'
import { FillBar, ManualBadge, StatusBadge, TypeBadge } from './primitives'

const ROW_HEIGHT = 44

const COL_WIDTHS = [220, 150, 90, 110, 110, 96, 150, 96, 110, 96]
const GRID_GAP = 8
const GRID_PAD_X = 12
const GRID = COL_WIDTHS.map((width) => `${width}px`).join(' ')

const MIN_WIDTH =
  COL_WIDTHS.reduce((sum, width) => sum + width, 0) + GRID_GAP * (COL_WIDTHS.length - 1) + GRID_PAD_X * 2

const REASON_HINTS: Record<ShortfallReason, string> = {
  FULL: 'Fully allocated',
  STOCK: 'Limited by remaining stock',
  CREDIT: 'Limited by customer credit',
  NO_PRICE: 'No price configured for this item/supplier',
  NONE: '',
}

const COLUMNS: { key: SortKey | null; label: string; align?: 'right' | 'center' }[] = [
  { key: 'id', label: 'Sub-order' },
  { key: null, label: 'Customer' },
  { key: null, label: 'Item' },
  { key: null, label: 'Warehouse' },
  { key: null, label: 'Supplier' },
  { key: 'priority', label: 'Type' },
  { key: 'created', label: 'Created' },
  { key: 'request', label: 'Request', align: 'right' },
  { key: 'allocated', label: 'Allocate', align: 'right' },
  { key: 'fill', label: 'Status', align: 'center' },
]

export function AllocationTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  reasons,
  onSelect,
  selectedId,
  compact = false,
}: {
  rows: Row[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  reasons: Map<string, ShortfallReason>
  onSelect: (subOrderId: string) => void
  selectedId: string | null
  compact?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(50)

  // page resets when ids change. Quantity edits must not be in this key.
  const rowKey = useMemo(() => rows.map((row) => row.subOrder.id).join('\n'), [rows])
  useEffect(() => {
    setPage(0)
  }, [rowKey])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const start = current * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollTop = 0
  }, [current, pageSize])

  const virtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey: (index) => pageRows[index]?.subOrder.id ?? index,
  })

  const virtualRows = virtualizer.getVirtualItems()

  const pagination = (
    <TablePagination
      component="div"
      count={rows.length}
      page={current}
      onPageChange={(_, next) => setPage(next)}
      rowsPerPage={pageSize}
      onRowsPerPageChange={(event) => {
        setPageSize(Number(event.target.value))
        setPage(0)
      }}
      rowsPerPageOptions={[25, 50, 100]}
      showFirstButton
      showLastButton
      labelRowsPerPage="Rows per page"
      labelDisplayedRows={({ from, to, count }) =>
        `${formatInt(from)}–${formatInt(to)} of ${formatInt(count)}`
      }
      getItemAriaLabel={(type) =>
        type === 'first' ? 'First page' : type === 'last' ? 'Last page' : type === 'next' ? 'Next page' : 'Previous page'
      }
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        flexShrink: 0,
        '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', justifyContent: 'center', px: 1 },
      }}
    />
  )

  if (compact) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <div className="min-h-0 flex-1 overflow-auto">
          {pageRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No sub-orders match the current filters.</div>
          ) : (
            <ul>
              {pageRows.map((row) => (
                <CompactRow
                  key={row.subOrder.id}
                  row={row}
                  reason={reasons.get(row.subOrder.id) ?? 'NONE'}
                  selected={selectedId === row.subOrder.id}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          )}
        </div>
        {pagination}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" tabIndex={-1}>
        <div style={{ minWidth: MIN_WIDTH }}>
          <div
            className="sticky top-0 z-10 grid items-center gap-2 border-b border-line bg-canvas px-3 py-2 text-[11px] font-medium text-muted"
            style={{ gridTemplateColumns: GRID }}
            role="row"
          >
            {COLUMNS.map(({ key, label, align }) => (
              <div
                key={label}
                className={align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}
                role="columnheader"
              >
                {key ? (
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    className="inline-flex items-center gap-1 hover:text-ink"
                    aria-label={`Sort by ${label}`}
                  >
                    {label}
                    <span aria-hidden="true" className="text-[9px]">
                      {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '·'}
                    </span>
                  </button>
                ) : (
                  label
                )}
              </div>
            ))}
          </div>

          {pageRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No sub-orders match the current filters.
            </div>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualRows.map((virtualRow) => {
                const row = pageRows[virtualRow.index]
                if (!row) return null
                return (
                  <TableRow
                    key={virtualRow.key}
                    row={row}
                    top={virtualRow.start}
                    reason={reasons.get(row.subOrder.id) ?? 'NONE'}
                    onSelect={onSelect}
                    selected={selectedId === row.subOrder.id}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
      {pagination}
    </div>
  )
}

function routeLabel(id: string, anyId: string): string {
  return id === anyId ? 'Any' : id
}

function CompactRow({
  row,
  reason,
  selected,
  onSelect,
}: {
  row: Row
  reason: ShortfallReason
  selected: boolean
  onSelect: (subOrderId: string) => void
}) {
  const { subOrder: so } = row
  return (
    <li className={`border-b border-line-soft ${selected ? 'bg-google-soft' : ''}`}>
      <button type="button" onClick={() => onSelect(so.id)} className="w-full px-3 py-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-ink">{so.id}</span>
              {row.isManual ? <ManualBadge compact /> : null}
            </div>
            <div className="truncate text-xs text-muted">{row.customerName}</div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <TypeBadge type={so.type} />
            <StatusBadge status={row.status} />
          </div>
        </div>
        <div className="mt-1 truncate text-xs text-muted">
          {so.itemId} · {routeLabel(so.warehouseId, ANY_WAREHOUSE)} · {routeLabel(so.supplierId, ANY_SUPPLIER)}
          {so.remark ? ` · ${so.remark}` : ''}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-muted">Request</div>
            <div className="nums text-sm text-ink">{formatQty(so.request)} kg</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Allocated</div>
            <div className="nums text-sm text-ink">{formatQty(row.allocated)} kg</div>
          </div>
        </div>
        <div className="mt-2" title={REASON_HINTS[reason]}>
          <FillBar value={percent(row.allocated, so.request)} tone={row.status} />
        </div>
      </button>
    </li>
  )
}

function TableRow({
  row,
  top,
  reason,
  onSelect,
  selected,
}: {
  row: Row
  top: number
  reason: ShortfallReason
  onSelect: (subOrderId: string) => void
  selected: boolean
}) {
  const { subOrder: so } = row
  const fill = percent(row.allocated, so.request)

  return (
    <div
      className={`absolute left-0 grid w-full items-center gap-2 border-b border-line-soft px-3 text-xs transition-colors ${
        selected ? 'bg-google-soft' : 'hover:bg-hover'
      }`}
      style={{ gridTemplateColumns: GRID, height: ROW_HEIGHT, transform: `translateY(${top}px)` }}
      onClick={() => onSelect(so.id)}
      role="row"
    >
      <div className="truncate">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-ink">{so.id}</span>
          {row.isManual ? <ManualBadge compact /> : null}
        </div>
        {so.remark ? <div className="truncate text-[10px] text-faint">{so.remark}</div> : null}
      </div>

      <div className="truncate text-ink" title={`${row.customerName} (${so.customerId})`}>
        <div className="truncate">{row.customerName}</div>
        <div className="truncate text-[10px] text-faint">{so.customerId}</div>
      </div>

      <div className="text-ink">{so.itemId}</div>
      <div className={so.warehouseId === ANY_WAREHOUSE ? 'text-google' : 'text-muted'}>
        {so.warehouseId === ANY_WAREHOUSE ? 'Any' : so.warehouseId}
      </div>
      <div className={so.supplierId === ANY_SUPPLIER ? 'text-google' : 'text-muted'}>
        {so.supplierId === ANY_SUPPLIER ? 'Any' : so.supplierId}
      </div>

      <div>
        <TypeBadge type={so.type} />
      </div>

      <div className="nums text-muted">{formatDate(so.createdAt)}</div>
      <div className="nums text-right text-ink">{formatQty(so.request)}</div>

      <div className="nums text-right text-ink">{formatQty(row.allocated)}</div>

      <div className="flex min-w-0 flex-col items-center" title={REASON_HINTS[reason]}>
        <div className="flex w-fit flex-col items-center gap-1">
          <StatusBadge status={row.status} />
          <div className="w-full">
            <div className="-mx-1">
              <FillBar value={fill} tone={row.status} />
            </div>
          </div>
        </div>
        <span className="nums sr-only">{`฿${formatMoney(row.value)}`}</span>
      </div>
    </div>
  )
}
