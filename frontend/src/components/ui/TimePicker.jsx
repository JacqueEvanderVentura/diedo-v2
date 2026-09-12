import { Clock } from 'lucide-react'
import { timeSlots } from '@/modules/agenda/lib/calendar'
import { cn } from '@/lib/utils'

export function TimePicker({
  value,
  onChange,
  slots = null,
  emptyMessage = 'No hay horarios disponibles.',
  className,
  testId = 'time-picker',
  placeholder = 'Seleccionar hora',
}) {
  const options = slots ?? timeSlots(8, 20, 30)

  if (options.length === 0) {
    return (
      <p
        className={cn('rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500', className)}
        data-testid={`${testId}-empty`}
      >
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className={cn('space-y-2', className)} data-testid={testId}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        {value ? `Hora: ${value}` : placeholder}
      </div>
      <div className="grid max-h-36 grid-cols-4 gap-2 overflow-y-auto rounded-xl border border-slate-100 p-2 sm:grid-cols-5">
        {options.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => onChange?.(slot)}
            data-testid={`${testId}-slot-${slot}`}
            className={cn(
              'rounded-lg border px-2 py-2 text-xs font-semibold transition-colors',
              value === slot
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:border-blue-200'
            )}
          >
            {slot}
          </button>
        ))}
      </div>
    </div>
  )
}
