import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import SearchIcon from '@mui/icons-material/Search'
import InputAdornment from '@mui/material/InputAdornment'
import { ORDER_TYPES, type OrderType } from '../domain/types'
import { ORDER_TYPE_LABELS } from '../data/generate'
import type { FillStatus, Filters } from '../app/useFilteredRows'
import { Button } from './primitives'

const STATUS_OPTIONS: { value: FillStatus; label: string }[] = [
  { value: 'FULL', label: 'Filled' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'NONE', label: 'Unfilled' },
]

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Chip
      size="small"
      label={children}
      onClick={onClick}
      color={active ? 'primary' : 'default'}
      variant={active ? 'filled' : 'outlined'}
      aria-pressed={active}
    />
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  empty,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  empty: string
  options: string[]
}) {
  return (
    <Select
      size="small"
      value={value}
      displayEmpty
      onChange={(event) => onChange(String(event.target.value))}
      SelectDisplayProps={{ 'aria-label': label }}
      sx={{ borderRadius: 999, minWidth: 148, backgroundColor: 'background.paper' }}
    >
      <MenuItem value="">{empty}</MenuItem>
      {options.map((id) => (
        <MenuItem key={id} value={id}>
          {id}
        </MenuItem>
      ))}
    </Select>
  )
}

export function FilterBar({
  filters,
  onChange,
  items,
  warehouses,
  suppliers,
  resultCount,
  totalCount,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  items: string[]
  warehouses: string[]
  suppliers: string[]
  resultCount: number
  totalCount: number
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value })

  const isFiltered =
    filters.search !== '' ||
    filters.types.size > 0 ||
    filters.statuses.size > 0 ||
    filters.itemId !== '' ||
    filters.warehouseId !== '' ||
    filters.supplierId !== '' ||
    filters.manualOnly

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TextField
        size="small"
        type="search"
        value={filters.search}
        onChange={(event) => set('search', event.target.value)}
        placeholder="Search order, sub-order, customer, item, warehouse…"
        sx={{
          minWidth: 0,
          width: '100%',
          flex: '1 1 100%',
          '@media (min-width: 640px)': { flex: '1 1 240px', width: 'auto' },
          '& .MuiOutlinedInput-root': {
            height: 40,
            borderRadius: 999,
            backgroundColor: '#f1f3f4',
            fontSize: 14,
          },
        }}
        slotProps={{
          htmlInput: { 'aria-label': 'Search orders' },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />

      <div className="flex items-center gap-1" role="group" aria-label="Filter by order type">
        {ORDER_TYPES.map((type: OrderType) => (
          <FilterChip
            key={type}
            active={filters.types.has(type)}
            onClick={() => set('types', toggle(filters.types, type))}
          >
            {ORDER_TYPE_LABELS[type]}
          </FilterChip>
        ))}
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="Filter by fill status">
        {STATUS_OPTIONS.map(({ value, label }) => (
          <FilterChip
            key={value}
            active={filters.statuses.has(value)}
            onClick={() => set('statuses', toggle(filters.statuses, value))}
          >
            {label}
          </FilterChip>
        ))}
      </div>

      <FilterChip active={filters.manualOnly} onClick={() => set('manualOnly', !filters.manualOnly)}>
        Manual only
      </FilterChip>

      <FilterSelect
        label="Filter by item"
        value={filters.itemId}
        onChange={(value) => set('itemId', value)}
        empty="All items"
        options={items}
      />
      <FilterSelect
        label="Filter by warehouse"
        value={filters.warehouseId}
        onChange={(value) => set('warehouseId', value)}
        empty="All warehouses"
        options={warehouses}
      />
      <FilterSelect
        label="Filter by supplier"
        value={filters.supplierId}
        onChange={(value) => set('supplierId', value)}
        empty="All suppliers"
        options={suppliers}
      />

      <span className="nums text-xs text-muted">
        {resultCount.toLocaleString()} / {totalCount.toLocaleString()}
      </span>

      {isFiltered ? <Button onClick={() => onChange({ ...filters, ...cleared })}>Clear</Button> : null}
    </div>
  )
}

const cleared = {
  search: '',
  types: new Set<OrderType>(),
  statuses: new Set<FillStatus>(),
  itemId: '',
  warehouseId: '',
  supplierId: '',
  manualOnly: false,
}
