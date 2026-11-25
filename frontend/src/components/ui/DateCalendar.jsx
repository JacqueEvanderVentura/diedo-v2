import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DAY_LABELS,
  addMonthsKey,
  formatLongDate,
  formatMonthYear,
  monthGrid,
} from '@/modules/agenda/lib/calendar'
import { todayKey } from '@/stores/agendaStore'
import { cn } from '@/lib/utils'

const VISIBLE_STATUSES = ['empty', 'limited', 'full']

const STATUS_MARK = {
  empty: 'w-1.5 bg-emerald-400/60',
  limited: 'w-3 bg-amber-400/80',
  full: 'w-4 bg-rose-400/85',
}

const STATUS_PHRASE = {
  empty: 'día libre',
  limited: 'pocos cupos',
  full: 'completo',
}

export function DateCalendar({
  value = null,
  onChange,
  minDate = null,
  className,
  testId = 'date-calendar',
  dayStatuses = null,
  onVisibleRangeChange,
}) {
  const [cursor, setCursor] = useState(value || todayKey())

  useEffect(() => {
    if (value) setCursor(value)
  }, [value])

  const cells = useMemo(() => monthGrid(cursor), [cursor])

  useEffect(() => {
    if (!onVisibleRangeChange || !cells.length) return
    onVisibleRangeChange({ from: cells[0].key, to: cells[cells.length - 1].key })
  }, [cells, onVisibleRangeChange])

  const pickDate = (key) => {
    if (minDate && key < minDate) return
    onChange?.(key)
  }

  const showLegend = cells.some(({ key, inMonth }) => {
    if (!inMonth) return false
    if (minDate && key < minDate) return false
    return VISIBLE_STATUSES.includes(dayStatuses?.[key])
  })

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
          const status = !disabled && inMonth ? dayStatuses?.[key] : undefined
          const showMark = VISIBLE_STATUSES.includes(status)
          const statusPhrase = STATUS_PHRASE[status]
          const ariaLabel = statusPhrase
            ? `${formatLongDate(key)}, ${statusPhrase}`
            : formatLongDate(key)
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => pickDate(key)}
              data-testid={`${testId}-day-${key}`}
              data-availability={showMark ? status : undefined}
              aria-label={ariaLabel}
              className={cn(
                'relative h-8 rounded-lg text-xs font-semibold transition-colors',
                !inMonth && 'text-slate-300',
                inMonth && !selected && !disabled && 'text-slate-700 hover:bg-blue-50 hover:text-blue-700',
                disabled && 'cursor-not-allowed text-slate-200',
                selected && 'bg-blue-600 text-white',
                isToday && !selected && 'ring-1 ring-blue-200'
              )}
            >
              {key.split('-')[2]}
              {showMark ? (
                <span
                  aria-hidden
                  data-testid={`${testId}-mark-${key}`}
                  className={cn(
                    'pointer-events-none absolute bottom-1 left-1/2 h-0.5 -translate-x-1/2 rounded-full',
                    STATUS_MARK[status],
                    selected && 'bg-white/80'
                  )}
                />
              ) : null}
            </button>
          )
        })}
      </div>

      {showLegend ? (
        <ul
          className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-500"
          data-testid={`${testId}-legend`}
        >
          <li className="flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-1.5 rounded-full bg-emerald-400/60" />
            Libre
          </li>
          <li className="flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-3 rounded-full bg-amber-400/80" />
            Pocos cupos
          </li>
          <li className="flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-rose-400/85" />
            Completo
          </li>
        </ul>
      ) : null}
    </div>
  )
}
