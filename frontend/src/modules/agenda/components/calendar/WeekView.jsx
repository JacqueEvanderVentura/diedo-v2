import { Card } from '@/components/ui/Card'
import { DAY_LABELS, fromKey, weekKeysMonday } from '../../lib/calendar'
import { AppointmentChip } from './AppointmentChip'
import { cn } from '@/lib/utils'
import { todayKey } from '@/stores/agendaStore'

export function WeekView({ cursor, appointments, onScheduleDay, onAppointmentClick }) {
  const days = weekKeysMonday(cursor)
  const byDate = appointments.reduce((acc, a) => {
    ;(acc[a.date] ||= []).push(a)
    return acc
  }, {})
  Object.values(byDate).forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)))

  return (
    <Card className="p-4" data-testid="calendar-week-view">
      <h3 className="mb-4 font-heading text-lg font-semibold text-slate-800">Vista de Semana</h3>
      <div className="mb-2 grid grid-cols-7 gap-2">
        {DAY_LABELS.map((label) => (
          <div key={label} className="text-center text-sm font-semibold text-slate-500">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((key) => {
          const d = fromKey(key)
          const list = byDate[key] || []
          const isToday = key === todayKey()
          const isSelected = key === cursor
          return (
            <div
              key={key}
              role={onScheduleDay ? 'button' : undefined}
              tabIndex={onScheduleDay ? 0 : undefined}
              data-testid={`calendar-week-day-${key}`}
              onClick={() => onScheduleDay?.(key)}
              onKeyDown={(event) => {
                if (!onScheduleDay || event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onScheduleDay(key)
                }
              }}
              className={cn(
                'min-h-[180px] rounded-xl border p-2 text-left',
                onScheduleDay && 'cursor-pointer transition-colors hover:border-blue-200 hover:bg-blue-50/20',
                isToday && 'border-blue-200 bg-blue-50/40',
                !isToday && isSelected && 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-200',
                !isToday && !isSelected && 'border-slate-100'
              )}
            >
              <p
                className={cn(
                  'mb-2 px-1 text-xs font-semibold',
                  isToday || isSelected ? 'text-blue-600' : 'text-slate-500'
                )}
              >
                {d.getDate()}
              </p>
              <div className="space-y-0">
                {list.slice(0, 6).map((apt) => (
                  <AppointmentChip key={apt.id} apt={apt} compact onClick={onAppointmentClick} />
                ))}
                {list.length > 6 && (
                  <p className="pt-1 text-center text-[10px] font-semibold text-blue-600">+{list.length - 6} más</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
