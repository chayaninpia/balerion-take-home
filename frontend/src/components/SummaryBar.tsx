import LinearProgress from '@mui/material/LinearProgress'
import type { LedgerTotals } from '../domain/allocation'
import { formatCompact, formatInt, formatMoney, percent } from '../lib/format'
import { Panel } from './primitives'

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'good' | 'warn' | 'muted'
}) {
  const colour = {
    default: 'text-ink',
    good: 'text-good',
    warn: 'text-warn',
    muted: 'text-muted',
  }[tone]

  return (
    <div className="px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`nums text-lg font-medium ${colour}`}>{value}</div>
      {hint ? <div className="nums text-[11px] text-faint">{hint}</div> : null}
    </div>
  )
}

export function SummaryBar({ totals, rowCount }: { totals: LedgerTotals; rowCount: number }) {
  const filled = percent(totals.allocated, totals.requested)

  return (
    <Panel className="overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-line-soft sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sub-orders" value={formatInt(rowCount)} hint="matching filters" />
        <Stat
          label="Requested"
          value={`${formatCompact(totals.requested)} kg`}
          hint={`${formatInt(totals.requested)} kg total`}
        />
        <Stat
          label="Allocated"
          value={`${formatCompact(totals.allocated)} kg`}
          hint={`${filled.toFixed(1)}% of requested`}
          tone="good"
        />
        <Stat
          label="Stock left"
          value={`${formatCompact(totals.stockRemaining)} kg`}
          hint="across all lots"
          tone={totals.stockRemaining > 0 ? 'default' : 'muted'}
        />
        <Stat label="Value" value={`฿${formatMoney(totals.value)}`} hint="at tier prices" />
        <Stat
          label="Fill status"
          value={`${formatInt(totals.fullyFilled)} full`}
          hint={`${formatInt(totals.partiallyFilled)} partial · ${formatInt(totals.unfilled)} none`}
          tone={totals.unfilled > 0 ? 'warn' : 'good'}
        />
      </div>
      <LinearProgress variant="determinate" value={filled} sx={{ height: 4 }} />
    </Panel>
  )
}
