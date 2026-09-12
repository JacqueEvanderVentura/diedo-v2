import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { formatCompactDate } from '@/modules/agenda/lib/calendar'
import { cn } from '@/lib/utils'
import { DateCalendar } from './DateCalendar'

export function DatePicker({
  value,
  onChange,
  minDate = null,
  className,
  testId = 'date-picker',
  placeholder = 'Seleccionar fecha',
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const label = value ? formatCompactDate(value) : placeholder

  const pickDate = (key) => {
    onChange?.(key)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn('relative', className)} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        data-testid={`${testId}-trigger`}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition-[border-color,box-shadow] hover:border-blue-200 hover:shadow-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
          <span className={cn('truncate', !value && 'text-slate-400')}>{label}</span>
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 z-50 mt-2 w-[min(100%,280px)] shadow-xl"
          data-testid={`${testId}-menu`}
        >
          <DateCalendar
            value={value}
            onChange={pickDate}
            minDate={minDate}
            testId={`${testId}-calendar`}
          />
        </div>
      )}
    </div>
  )
}
