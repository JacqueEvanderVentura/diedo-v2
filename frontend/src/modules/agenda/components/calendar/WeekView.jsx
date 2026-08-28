import { Card } from '@/components/ui/Card'
import { DAY_LABELS, fromKey, weekKeysMonday } from '../../lib/calendar'
import { AppointmentChip } from './AppointmentChip'
import { cn } from '@/lib/utils'
import { todayKey } from '@/stores/agendaStore'

export function WeekView({ cursor, appointments, onDayClick, onAppointmentClick }) {
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
              data-testid={`calendar-week-day-${key}`}
              className={cn(
                'min-h-[180px] rounded-xl border p-2 text-left',
                isToday && 'border-blue-200 bg-blue-50/40',
                !isToday && isSelected && 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-200',
                !isToday && !isSelected && 'border-slate-100'
              )}
            >
              <button
                type="button"
                onClick={() => onDayClick(key)}
                className={cn(
                  'mb-2 rounded-md px-1 text-xs font-semibold transition-colors hover:bg-white/80',
                  isToday || isSelected ? 'text-blue-600' : 'text-slate-500'
                )}
              >
                {d.getDate()}
              </button>
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
