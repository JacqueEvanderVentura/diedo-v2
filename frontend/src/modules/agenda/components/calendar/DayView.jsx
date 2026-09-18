import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { formatLongDate, timeSlots } from '../../lib/calendar'
import { AppointmentChip } from './AppointmentChip'
import {
  activeAppointmentsForResource,
  assignAppointmentLanes,
  appointmentStartsAtSlot,
  appointmentsOverlappingSlot,
  calendarRowSpan,
  CALENDAR_SLOT_MINUTES,
} from '../../lib/dayViewSlots'
import { cn } from '@/lib/utils'

const ROW_PX = 52

export function DayView({ dateKey, appointments, resources = [], onSlotClick, onAppointmentClick }) {
  const slots = timeSlots(8, 20, CALENDAR_SLOT_MINUTES)

  const laneLayoutByResource = useMemo(() => {
    const map = new Map()
    for (const resource of resources) {
      const resourceAppointments = activeAppointmentsForResource(appointments, dateKey, resource.id)
      map.set(resource.id, assignAppointmentLanes(resourceAppointments))
    }
    return map
  }, [appointments, dateKey, resources])

  return (
    <Card className="overflow-hidden p-4" data-testid="calendar-day-view">
      <h3 className="mb-1 font-heading text-lg font-semibold text-slate-800">Vista de Día</h3>
      <p className="mb-4 text-sm capitalize text-slate-500">{formatLongDate(dateKey)}</p>

      {resources.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No hay cabinas o recursos activos configurados para esta sucursal.
        </p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[900px]">
            <div
              className="grid gap-0"
              style={{ gridTemplateColumns: `80px repeat(${resources.length}, minmax(120px, 1fr))` }}
            >
              <div className="border-b border-slate-100 bg-slate-50 px-2 py-3 text-xs font-bold uppercase text-slate-400">
                Hora
              </div>
              {resources.map((c) => (
                <div
                  key={c.id}
                  className="border-b border-l border-slate-100 bg-slate-50 px-2 py-3 text-center text-xs font-bold text-slate-600"
                >
                  {c.name}
                </div>
              ))}

              {slots.map((slot) => (
                <div key={slot} className="contents">
                  <div className="border-b border-slate-100 px-2 py-3 text-xs font-medium text-slate-400">{slot}</div>
                  {resources.map((c) => {
                    const resourceAppointments = activeAppointmentsForResource(appointments, dateKey, c.id)
                    const { assignment, laneCount } = laneLayoutByResource.get(c.id) || {
                      assignment: new Map(),
                      laneCount: 1,
                    }
                    const overlapping = appointmentsOverlappingSlot(resourceAppointments, slot)
                    const busy = overlapping.length > 0

                    return (
                      <div
                        key={`${c.id}-${slot}`}
                        data-testid={`calendar-slot-${c.id}-${slot}`}
                        className={cn(
                          'relative min-h-[52px] border-b border-l border-slate-100 p-1',
                          busy && 'bg-blue-50/25'
                        )}
                      >
                        {busy ? (
                          <div className="flex h-full min-h-[44px] gap-0.5">
                            {Array.from({ length: laneCount }, (_, laneIndex) => {
                              const laneAppointment = overlapping.find(
                                (apt) => assignment.get(apt.id) === laneIndex
                              )
                              if (!laneAppointment) {
                                return (
                                  <button
                                    key={laneIndex}
                                    type="button"
                                    onClick={() => onSlotClick?.({ date: dateKey, time: slot, cabinaId: c.id })}
                                    disabled={!onSlotClick}
                                    className="min-w-0 flex-1 rounded-lg transition-colors hover:bg-blue-50/60"
                                    aria-label={`Agendar ${slot} en ${c.name}`}
                                  />
                                )
                              }
                              const starting = appointmentStartsAtSlot(laneAppointment, slot)
                              const rowSpan = starting ? calendarRowSpan(laneAppointment.duration) : 1
                              if (starting) {
                                return (
                                  <div
                                    key={laneIndex}
                                    className="relative min-w-0 flex-1"
                                    style={{ minHeight: `${Math.max(44, rowSpan * ROW_PX - 8)}px` }}
                                  >
                                    <div
                                      className="absolute inset-x-0 top-0 z-10"
                                      style={{ height: `${rowSpan * ROW_PX - 8}px` }}
                                    >
                                      <AppointmentChip
                                        apt={laneAppointment}
                                        compact
                                        onClick={onAppointmentClick}
                                      />
                                    </div>
                                  </div>
                                )
                              }
                              return (
                                <div
                                  key={laneIndex}
                                  className="min-w-0 flex-1 rounded-lg bg-blue-100/25"
                                  aria-hidden="true"
                                  title="Horario ocupado por otra cita"
                                />
                              )
                            })}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSlotClick?.({ date: dateKey, time: slot, cabinaId: c.id })}
                            disabled={!onSlotClick}
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
      )}
    </Card>
  )
}
