import { Card } from '@/components/ui/Card'
import { DAY_LABELS, fromKey, monthGrid } from '../../lib/calendar'
import { AppointmentChip } from './AppointmentChip'
import { cn } from '@/lib/utils'
import { todayKey } from '@/stores/agendaStore'

export function MonthView({ cursor, appointments, onDayClick, onAppointmentClick }) {
  const cells = monthGrid(cursor)
  const byDate = appointments.reduce((acc, a) => {
    ;(acc[a.date] ||= []).push(a)
    return acc
  }, {})

  return (
    <Card className="p-4" data-testid="calendar-month-view">
      <h3 className="mb-4 font-heading text-lg font-semibold text-slate-800">Vista de Mes</h3>
      <div className="mb-2 grid grid-cols-7 gap-2">
        {DAY_LABELS.map((label) => (
          <div key={label} className="text-center text-sm font-semibold text-slate-500">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map(({ key, inMonth }) => {
          const list = byDate[key] || []
          const isToday = key === todayKey()
          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick(key)}
              data-testid={`calendar-month-day-${key}`}
              className={cn(
                'min-h-[120px] rounded-xl border p-2 text-left transition-colors hover:bg-slate-50',
                inMonth ? 'border-slate-100 bg-white' : 'border-transparent bg-slate-50/50 opacity-60',
                isToday && 'ring-2 ring-blue-200'
              )}
            >
              <div className="mb-1 text-xs font-semibold text-slate-500">{fromKey(key).getDate()}</div>
              {list.slice(0, 3).map((apt) => (
                <AppointmentChip key={apt.id} apt={apt} compact onClick={onAppointmentClick} />
              ))}
              {list.length > 3 && (
                <p className="pt-1 text-center text-[10px] font-semibold text-blue-600">+{list.length - 3} más</p>
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
