import MuiButton from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import type { ChipProps } from '@mui/material/Chip'
import type { ReactNode } from 'react'
import type { OrderType } from '../domain/types'
import type { FillStatus } from '../app/useFilteredRows'

const TYPE_COLOR: Record<OrderType, ChipProps['color']> = {
  EMERGENCY: 'error',
  OVER_DUE: 'warning',
  DAILY: 'primary',
}

const TYPE_LABELS: Record<OrderType, string> = {
  EMERGENCY: 'Emergency',
  OVER_DUE: 'Overdue',
  DAILY: 'Daily',
}

const badgeSx = { height: 20, fontSize: 11, fontWeight: 500 }

export function TypeBadge({ type }: { type: OrderType }) {
  return <Chip size="small" label={TYPE_LABELS[type]} color={TYPE_COLOR[type]} sx={badgeSx} />
}

const STATUS_COLOR: Record<FillStatus, ChipProps['color']> = {
  FULL: 'success',
  PARTIAL: 'warning',
  NONE: 'default',
}

const STATUS_LABELS: Record<FillStatus, string> = {
  FULL: 'Filled',
  PARTIAL: 'Partial',
  NONE: 'Unfilled',
}

export function StatusBadge({ status }: { status: FillStatus }) {
  return <Chip size="small" label={STATUS_LABELS[status]} color={STATUS_COLOR[status]} sx={badgeSx} />
}

export function ManualBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Chip
      size="small"
      color="secondary"
      label={compact ? 'M' : 'Manual'}
      title="Manually allocated"
      sx={badgeSx}
    />
  )
}

const BAR_COLOR: Record<FillStatus, string> = {
  FULL: '#34a853',
  PARTIAL: '#f9ab00',
  NONE: '#dadce0',
}

export function FillBar({ value, tone }: { value: number; tone: FillStatus }) {
  return (
    <LinearProgress
      variant="determinate"
      value={value}
      aria-hidden
      sx={{
        height: 8,
        borderRadius: 99,
        backgroundColor: '#e8eaed',
        '& .MuiLinearProgress-bar': { backgroundColor: BAR_COLOR[tone], borderRadius: 99 },
      }}
    />
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Paper variant="outlined" className={className} sx={{ borderColor: 'divider', backgroundColor: 'background.paper' }}>
      {children}
    </Paper>
  )
}

const BUTTON_STYLE = {
  primary: { variant: 'contained', color: 'primary' },
  ghost: { variant: 'outlined', color: 'primary' },
  danger: { variant: 'text', color: 'error' },
} as const

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  title?: string
}) {
  const style = BUTTON_STYLE[variant]
  return (
    <MuiButton
      type="button"
      size="small"
      variant={style.variant}
      color={style.color}
      onClick={onClick}
      disabled={disabled}
      title={title}
      sx={{ borderRadius: 999, px: 2, height: 36 }}
    >
      {children}
    </MuiButton>
  )
}
