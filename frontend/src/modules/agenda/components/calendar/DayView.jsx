import { Card } from '@/components/ui/Card'
import { CABINAS } from '@/data/agenda'
import { formatLongDate, timeSlots } from '../../lib/calendar'
import { AppointmentChip } from './AppointmentChip'
import { cn } from '@/lib/utils'

export function DayView({ dateKey, appointments, onSlotClick, onAppointmentClick }) {
  const slots = timeSlots()
  const byCabina = CABINAS.reduce((acc, c) => {
    acc[c.id] = appointments.filter((a) => a.date === dateKey && a.cabinaId === c.id)
    return acc
  }, {})

  return (
    <Card className="overflow-hidden p-4" data-testid="calendar-day-view">
      <h3 className="mb-1 font-heading text-lg font-semibold text-slate-800">Vista de Día</h3>
      <p className="mb-4 text-sm capitalize text-slate-500">{formatLongDate(dateKey)}</p>

      <div className="overflow-x-auto scrollbar-thin">
        <div className="min-w-[900px]">
          <div className="grid gap-0" style={{ gridTemplateColumns: `80px repeat(${CABINAS.length}, minmax(120px, 1fr))` }}>
            <div className="border-b border-slate-100 bg-slate-50 px-2 py-3 text-xs font-bold uppercase text-slate-400">Hora</div>
            {CABINAS.map((c) => (
              <div key={c.id} className="border-b border-l border-slate-100 bg-slate-50 px-2 py-3 text-center text-xs font-bold text-slate-600">
                {c.name}
              </div>
            ))}

            {slots.map((slot) => (
              <div key={slot} className="contents">
                <div className="border-b border-slate-100 px-2 py-3 text-xs font-medium text-slate-400">{slot}</div>
                {CABINAS.map((c) => {
                  const apt = byCabina[c.id]?.find((a) => a.time === slot)
                  return (
                    <div
                      key={`${c.id}-${slot}`}
                      data-testid={`calendar-slot-${c.id}-${slot}`}
                      className={cn(
                        'min-h-[52px] border-b border-l border-slate-100 p-1',
                        apt ? 'bg-blue-50/30' : 'hover:bg-blue-50/50'
                      )}
                    >
                      {apt ? (
                        <AppointmentChip apt={apt} compact onClick={onAppointmentClick} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSlotClick({ date: dateKey, time: slot, cabinaId: c.id })}
                          className="h-full min-h-[44px] w-full rounded-lg text-left transition-colors hover:bg-blue-50/50"
                          aria-label={`Agendar ${slot} en ${c.name}`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
