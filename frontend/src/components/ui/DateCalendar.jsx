import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DAY_LABELS,
  addMonthsKey,
  formatMonthYear,
  monthGrid,
} from '@/modules/agenda/lib/calendar'
import { todayKey } from '@/stores/agendaStore'
import { cn } from '@/lib/utils'

export function DateCalendar({
  value = null,
  onChange,
  minDate = null,
  className,
  testId = 'date-calendar',
}) {
  const [cursor, setCursor] = useState(value || todayKey())

  useEffect(() => {
    if (value) setCursor(value)
  }, [value])

  const cells = useMemo(() => monthGrid(cursor), [cursor])

  const pickDate = (key) => {
    if (minDate && key < minDate) return
    onChange?.(key)
  }

  return (
    <div className={cn('rounded-xl border border-slate-100 bg-white p-3', className)} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor((current) => addMonthsKey(current, -1))}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          aria-label="Mes anterior"
          data-testid={`${testId}-prev`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold capitalize text-slate-700">{formatMonthYear(cursor)}</p>
        <button
          type="button"
          onClick={() => setCursor((current) => addMonthsKey(current, 1))}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          aria-label="Mes siguiente"
          data-testid={`${testId}-next`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAY_LABELS.map((day) => (
          <div key={day} className="text-center text-[10px] font-semibold uppercase text-slate-400">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ key, inMonth }) => {
          const disabled = minDate && key < minDate
          const selected = value === key
          const isToday = key === todayKey()
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => pickDate(key)}
              data-testid={`${testId}-day-${key}`}
              className={cn(
                'h-8 rounded-lg text-xs font-semibold transition-colors',
                !inMonth && 'text-slate-300',
                inMonth && !selected && !disabled && 'text-slate-700 hover:bg-blue-50 hover:text-blue-700',
                disabled && 'cursor-not-allowed text-slate-200',
                selected && 'bg-blue-600 text-white',
                isToday && !selected && 'ring-1 ring-blue-200'
              )}
            >
              {key.split('-')[2]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
