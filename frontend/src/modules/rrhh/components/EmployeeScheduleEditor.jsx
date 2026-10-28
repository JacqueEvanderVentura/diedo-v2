import { useMemo, useState } from 'react'
import { Clock, Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  coerceWorkSchedule,
  copyWeekdaySchedule,
  dayHasErrors,
  getBlockError,
  minutesToTime,
  summarizeDayBlocks,
  timeToMinutes,
} from '../lib/schedule'

const LAST_MINUTE = 23 * 60 + 59
const MIN_NEW_BLOCK = 30

function DayTimeline({ blocks }) {
  const dayStart = Math.min(7 * 60, ...blocks.map((block) => timeToMinutes(block.start)))
  const dayEnd = Math.max(21 * 60, ...blocks.map((block) => timeToMinutes(block.end)))
  const span = dayEnd - dayStart

  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-200/80">
        {blocks.map((block, idx) => {
          const left = ((timeToMinutes(block.start) - dayStart) / span) * 100
          const width = ((timeToMinutes(block.end) - timeToMinutes(block.start)) / span) * 100
          return (
            <span
              key={`${block.start}-${idx}`}
              className="absolute top-0 h-full rounded-full bg-blue-500"
              style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(2, width)}%` }}
              title={`${block.start} – ${block.end}`}
            />
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium text-slate-400">
        <span>{minutesToTime(dayStart)}</span>
        <span>{minutesToTime(dayEnd)}</span>
      </div>
    </div>
  )
}

export function EmployeeScheduleEditor({ value, onChange }) {
  const schedule = useMemo(() => coerceWorkSchedule(value), [value])
  const [activeDay, setActiveDay] = useState('mon')

  const blocks = schedule[activeDay] || []
  const blockErrors = blocks.map((_, index) => getBlockError(blocks, index))
  const validBlocks = blocks.filter((_, index) => !blockErrors[index])

  const latestEnd = blocks.reduce((latest, block) => {
    if (!block.start || !block.end) return latest
    const end = timeToMinutes(block.end)
    return end > timeToMinutes(block.start) ? Math.max(latest, end) : latest
  }, -1)
  const nextStart = latestEnd >= 0 ? latestEnd : 8 * 60
  const canAddBlock = nextStart + MIN_NEW_BLOCK <= LAST_MINUTE

  const updateDay = (day, nextBlocks) => {
    onChange({ ...schedule, [day]: nextBlocks })
  }

  const addBlock = () => {
    if (!canAddBlock) return
    const start = minutesToTime(nextStart)
    const end = minutesToTime(Math.min(nextStart + 120, LAST_MINUTE))
    updateDay(activeDay, [...blocks, { start, end }])
  }

  const updateBlock = (index, patch) => {
    updateDay(
      activeDay,
      blocks.map((block, i) => (i === index ? { ...block, ...patch } : block))
    )
  }

  const removeBlock = (index) => {
    updateDay(
      activeDay,
      blocks.filter((_, i) => i !== index)
    )
  }

  const copyMondayToWeekdays = () => {
    onChange(copyWeekdaySchedule(schedule, 'mon', ['tue', 'wed', 'thu', 'fri']))
  }

  return (
    <div className="space-y-4" data-testid="employee-schedule-editor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Clock className="h-4 w-4 text-blue-500" />
            Horario semanal por bloques
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Opcional: puedes dejar la semana vacía (por ejemplo lavadores sin horario fijo).
            Sin bloques, Agenda no restringe al empleado y Carwash no usa este horario.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={copyMondayToWeekdays}>
          <Copy className="h-3.5 w-3.5" />
          Copiar lunes a vie
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_KEYS.map((day) => {
          const count = schedule[day]?.length || 0
          const hasErrors = dayHasErrors(schedule[day])
          return (
            <button
              key={day}
              type="button"
              onClick={() => setActiveDay(day)}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-bold transition-colors',
                activeDay === day
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                hasErrors && 'ring-2 ring-red-400'
              )}
              aria-label={hasErrors ? `${WEEKDAY_LABELS[day]} (con errores)` : undefined}
              data-testid={`schedule-day-${day}`}
            >
              {WEEKDAY_SHORT[day]}
              {count > 0 && (
                <span
                  className={cn(
                    'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]',
                    hasErrors
                      ? 'bg-red-500 text-white'
                      : activeDay === day ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                  )}
                >
                  {hasErrors ? '!' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">{WEEKDAY_LABELS[activeDay]}</p>
            <p className="text-xs text-slate-500">{summarizeDayBlocks(blocks)}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={addBlock}
            disabled={!canAddBlock}
            title={canAddBlock ? undefined : 'No queda espacio en el día para otro bloque.'}
            data-testid="schedule-add-block"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar bloque
          </Button>
        </div>

        {validBlocks.length > 0 && <DayTimeline blocks={validBlocks} />}

        <div className="mt-4 space-y-2">
          {blocks.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              Sin bloques este día — no habrá cupos disponibles.
            </p>
          ) : (
            blocks.map((block, index) => {
              const error = blockErrors[index]
              const errorId = `schedule-block-${activeDay}-${index}-error`
              const inputClass = cn(
                'rounded-lg border-0 bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-inset focus:ring-2',
                error ? 'ring-red-300 focus:ring-red-500' : 'ring-slate-200 focus:ring-blue-600'
              )
              return (
                <div
                  key={`${activeDay}-${index}`}
                  className={cn(
                    'flex flex-wrap items-center gap-2 rounded-xl border p-3',
                    error ? 'border-red-200 bg-red-50/60' : 'border-slate-100 bg-slate-50/70'
                  )}
                  data-testid={`schedule-block-${activeDay}-${index}`}
                >
                  <input
                    type="time"
                    value={block.start}
                    onChange={(e) => updateBlock(index, { start: e.target.value })}
                    aria-label="Hora de entrada"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    className={inputClass}
                  />
                  <span className="text-xs font-semibold text-slate-400">a</span>
                  <input
                    type="time"
                    value={block.end}
                    onChange={(e) => updateBlock(index, { end: e.target.value })}
                    aria-label="Hora de salida"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeBlock(index)}
                    className="ml-auto rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    aria-label="Eliminar bloque"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {error && (
                    <p id={errorId} className="basis-full text-xs font-medium text-red-600">
                      {error}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
