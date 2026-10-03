import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Drawer from '@mui/material/Drawer'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useEffect, useMemo, useState } from 'react'
import { AllocationTable } from '../components/AllocationTable'
import { DetailPanel } from '../components/DetailPanel'
import { FilterBar } from '../components/FilterBar'
import { SummaryBar } from '../components/SummaryBar'
import { Button } from '../components/primitives'
import { exampleDataset, generateDataset } from '../data/generate'
import type { Dataset, ShortfallReason } from '../domain/types'
import { formatInt, formatQty } from '../lib/format'
import { useDebounced } from '../lib/useDebounced'
import { useAllocation } from './useAllocation'
import { EMPTY_FILTERS, useFilteredRows, type Filters, type SortDir, type SortKey } from './useFilteredRows'

type DatasetChoice = 'generated' | 'example'

const SUB_ORDER_COUNT = 5200
const NARROW_QUERY = '(max-width: 1279px)'

const LIMIT_REASON: Partial<Record<ShortfallReason, string>> = {
  STOCK: 'Not enough stock is left in the warehouses and suppliers this order can draw from.',
  CREDIT: 'This customer has no credit left for a larger allocation.',
  NO_PRICE: 'No price is configured for this item and supplier, so more cannot be allocated.',
}

// jsdom has no matchMedia, so tests stay on the table.
function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW_QUERY)?.matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(NARROW_QUERY)
    if (!media) return
    const apply = () => setNarrow(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])
  return narrow
}

export default function App() {
  const narrow = useNarrowLayout()
  const [choice, setChoice] = useState<DatasetChoice>('generated')

  // keyed on choice only. A wider dep list rebuilds the dataset and drops manual edits.
  const dataset = useMemo<Dataset>(
    () => (choice === 'generated' ? generateDataset({ subOrderCount: SUB_ORDER_COUNT }) : exampleDataset()),
    [choice],
  )

  const allocation = useAllocation(dataset)
  const { ctx, ledger, reasons, version, totals } = allocation

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const debouncedSearch = useDebounced(filters.search, 150)
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  )

  const rows = useFilteredRows(ctx, ledger, version, effectiveFilters, sortKey, sortDir)

  const facets = useMemo(() => {
    const items = new Set<string>()
    const warehouses = new Set<string>()
    const suppliers = new Set<string>()
    for (const so of ctx.subOrders) {
      items.add(so.itemId)
      warehouses.add(so.warehouseId)
      suppliers.add(so.supplierId)
    }
    const sorted = (set: Set<string>) => [...set].sort()
    return { items: sorted(items), warehouses: sorted(warehouses), suppliers: sorted(suppliers) }
  }, [ctx])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'priority' || key === 'created' || key === 'id' ? 'asc' : 'desc')
    }
  }

  const selectedReason: ShortfallReason = selectedId ? (reasons.get(selectedId) ?? 'NONE') : 'NONE'
  const [limitNotice, setLimitNotice] = useState<{
    asked: number
    granted: number
    reason: ShortfallReason
  } | null>(null)

  const applyQuantity = (qty: number) => {
    if (!selectedId) return
    const outcome = allocation.setManual(selectedId, qty)
    const why = outcome ? LIMIT_REASON[outcome.reason] : undefined
    if (outcome && why) {
      setLimitNotice({ asked: qty, granted: outcome.allocation.quantity, reason: outcome.reason })
    }
  }

  const allocateMax = () => {
    const so = selectedId ? ctx.subOrderById.get(selectedId) : undefined
    if (so) applyQuantity(so.request)
  }

  const detail = (
    <DetailPanel
      ctx={ctx}
      ledger={ledger}
      subOrderId={selectedId}
      reason={selectedReason}
      onClose={() => setSelectedId(null)}
      onAllocate={applyQuantity}
      onAllocateMax={allocateMax}
      onReset={() => selectedId && allocation.resetManual(selectedId)}
    />
  )

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-3 py-3 shadow-[0_1px_2px_rgba(60,64,67,0.12)] sm:px-4">
        <div className="flex items-center gap-3">
          <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
            <span className="size-2 rounded-full bg-[#4285F4]" />
            <span className="size-2 rounded-full bg-[#EA4335]" />
            <span className="size-2 rounded-full bg-[#FBBC05]" />
            <span className="size-2 rounded-full bg-[#34A853]" />
          </span>
          <div>
            <h1 className="text-[22px] leading-6 font-normal tracking-tight text-ink">
              Salmon Allocation
            </h1>
            <p className="text-xs text-muted">
              {formatInt(ctx.subOrders.length)} sub-orders · auto-assigned on load by Emergency →
              Overdue → Daily, then FIFO
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleButtonGroup
            exclusive
            size="small"
            value={choice}
            aria-label="Dataset"
            onChange={(_, value: DatasetChoice | null) => {
              if (!value) return
              setChoice(value)
              setSelectedId(null)
            }}
            sx={{
              gap: 1,
              '& .MuiToggleButtonGroup-grouped': {
                borderRadius: '999px !important',
                borderColor: 'divider',
                mx: 0,
                px: 1.5,
                fontSize: 12,
                textTransform: 'none',
              },
              '& .MuiToggleButtonGroup-middleButton, & .MuiToggleButtonGroup-lastButton': {
                marginLeft: 0,
                borderLeftColor: 'divider',
              },
            }}
          >
            <ToggleButton value="generated">{formatInt(SUB_ORDER_COUNT)} rows</ToggleButton>
            <ToggleButton value="example">Spec example</ToggleButton>
          </ToggleButtonGroup>

          <Button onClick={allocation.rerunAuto} title="Re-run auto-assignment, keeping manual rows pinned">
            Re-run auto
          </Button>
          <Button onClick={allocation.resetAll} title="Discard manual edits and allocate purely by the rules">
            Reset to auto
          </Button>
          <Button variant="danger" onClick={allocation.clearAll} title="Zero every allocation">
            Clear all
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <SummaryBar totals={totals} rowCount={rows.length} />

        <FilterBar
          filters={filters}
          onChange={setFilters}
          items={facets.items}
          warehouses={facets.warehouses}
          suppliers={facets.suppliers}
          resultCount={rows.length}
          totalCount={ctx.subOrders.length}
        />

        <div className="flex min-h-0 min-w-0 flex-1 gap-3">
          <AllocationTable
            rows={rows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            reasons={reasons}
            onSelect={setSelectedId}
            selectedId={selectedId}
            compact={narrow}
          />

          {narrow ? (
            <Drawer
              anchor="right"
              open={selectedId !== null}
              onClose={() => setSelectedId(null)}
              slotProps={{ paper: { sx: { width: 'min(100%, 420px)' } } }}
            >
              {detail}
            </Drawer>
          ) : (
            <aside className={`w-[320px] shrink-0 ${selectedId ? '' : 'hidden xl:block'}`}>{detail}</aside>
          )}
        </div>
      </div>

      <Dialog open={limitNotice !== null} onClose={() => setLimitNotice(null)}>
        <DialogTitle>Couldn’t increase the allocation</DialogTitle>
        <DialogContent>
          {limitNotice ? (
            <div className="space-y-2 text-sm text-ink">
              <p>
                You entered {formatQty(limitNotice.asked)} kg. Only {formatQty(limitNotice.granted)} kg was
                allocated.
              </p>
              <p>{LIMIT_REASON[limitNotice.reason]}</p>
              <p>This row is now a manual order. Re-run auto keeps this quantity until you clear it.</p>
            </div>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button variant="primary" onClick={() => setLimitNotice(null)}>
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
