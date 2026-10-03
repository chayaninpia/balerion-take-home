import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import { useEffect, useRef, useState } from 'react'
import { formatQty } from '../lib/format'

export function QtyInput({
  value,
  max,
  onCommit,
  onReset,
  label,
}: {
  value: number
  max: number
  onCommit: (qty: number) => void
  onReset?: () => void
  label: string
}) {
  const [text, setText] = useState(() => format(value))
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // skip while focused so "1." is not reformatted. Props win after blur, including a clamp.
  useEffect(() => {
    if (!editing) setText(format(value))
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const parsed = Number.parseFloat(text.replace(/,/g, ''))
    if (Number.isNaN(parsed)) {
      setText(format(value))
      return
    }
    if (parsed === value) {
      setText(format(value))
      return
    }
    onCommit(Math.max(0, parsed))
  }

  const clamped = value > 0 && value < max

  return (
    <div className="flex items-center justify-end gap-1">
      <TextField
        inputRef={inputRef}
        value={text}
        size="small"
        color={clamped ? 'warning' : 'primary'}
        onFocus={() => setEditing(true)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
            inputRef.current?.blur()
          } else if (event.key === 'Escape') {
            setEditing(false)
            setText(format(value))
            inputRef.current?.blur()
          }
        }}
        sx={{
          width: 88,
          '& .MuiInputBase-input': { textAlign: 'right', fontSize: 12, py: 0.5, fontVariantNumeric: 'tabular-nums' },
        }}
        slotProps={{ htmlInput: { 'aria-label': label, inputMode: 'decimal' } }}
      />
      {onReset ? (
        <IconButton
          size="small"
          onClick={onReset}
          title="Clear manual allocation"
          aria-label={`Clear manual allocation for ${label}`}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      ) : (
        <span className="w-[14px]" aria-hidden="true" />
      )}
    </div>
  )
}

function format(value: number): string {
  return value === 0 ? '0' : formatQty(value)
}
