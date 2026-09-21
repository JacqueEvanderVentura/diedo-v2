import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { formatLongDate, timeSlots } from '../../lib/calendar'
import { AppointmentChip } from './AppointmentChip'
import {
  activeAppointmentsForResource,
  assignAppointmentLanes,
  appointmentStartsAtSlot,
  appointmentsOverlappingSlot,
  calendarBlockHeight,
  CALENDAR_ROW_PX,
  CALENDAR_SLOT_MINUTES,
} from '../../lib/dayViewSlots'
import { useCalendarResourceDrag } from '../../hooks/useCalendarResourceDrag'
import { cn } from '@/lib/utils'

const SLOT_CELL_MIN_PX = CALENDAR_ROW_PX

export function DayView({
  dateKey,
  appointments,
  resources = [],
  onSlotClick,
  onAppointmentClick,
  onResourceMove,
  canDrag = false,
  startHour = 8,
  endHour = 20,
}) {
  const slots = timeSlots(startHour, endHour, CALENDAR_SLOT_MINUTES)
  const {
    dragState,
    hoverTarget,
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
    consumeChipClick,
  } = useCalendarResourceDrag({
    onMove: onResourceMove,
    isDisabled: !canDrag,
  })

  const laneLayoutByResource = useMemo(() => {
    const map = new Map()
    for (const resource of resources) {
      const resourceAppointments = activeAppointmentsForResource(appointments, dateKey, resource.id)
      map.set(resource.id, assignAppointmentLanes(resourceAppointments))
    }
    return map
  }, [appointments, dateKey, resources])

  const handleChipClick = (apt) => {
    if (consumeChipClick()) return
    onAppointmentClick?.(apt)
  }

  return (
    <Card
      className="p-4"
      data-testid="calendar-day-view"
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={cancelDrag}
    >
      <h3 className="mb-1 font-heading text-lg font-semibold text-slate-800">Vista de Día</h3>
      <p className="mb-4 text-sm capitalize text-slate-500">{formatLongDate(dateKey)}</p>

      {resources.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No hay cabinas o recursos activos configurados para esta sucursal.
        </p>
      ) : (
        <div className="overflow-x-auto overflow-y-visible scrollbar-thin">
          <div className="min-w-[900px] overflow-visible">
            <div
              className="grid gap-0 overflow-visible"
              style={{ gridTemplateColumns: `80px repeat(${resources.length}, minmax(120px, 1fr))` }}
            >
              <div className="border-b border-slate-100 bg-slate-50 px-2 py-3 text-xs font-bold uppercase text-slate-400">
                Hora
              </div>
              {resources.map((c) => (
                <div
                  key={c.id}
                  data-calendar-resource={c.id}
                  className={cn(
                    'border-b border-l border-slate-100 bg-slate-50 px-2 py-3 text-center text-xs font-bold text-slate-600',
                    hoverTarget?.resourceId === c.id && 'bg-blue-50 text-blue-700'
                  )}
                >
                  {c.name}
                </div>
              ))}

              {slots.map((slot) => (
                <div key={slot} className="contents">
                  <div className="border-b border-slate-100 px-2 py-3 text-xs font-medium text-slate-400">{slot}</div>
                  {resources.map((c) => {
                    const canBook = c.access !== 'view'
                    const resourceAppointments = activeAppointmentsForResource(appointments, dateKey, c.id)
                    const { assignment, laneCount } = laneLayoutByResource.get(c.id) || {
                      assignment: new Map(),
                      laneCount: 1,
                    }
                    const overlapping = appointmentsOverlappingSlot(resourceAppointments, slot)
                    const busy = overlapping.length > 0
                    const dropActive = hoverTarget?.resourceId === c.id && hoverTarget?.slot === slot

                    return (
                      <div
                        key={`${c.id}-${slot}`}
                        data-testid={`calendar-slot-${c.id}-${slot}`}
                        data-calendar-resource={c.id}
                        data-calendar-slot={slot}
                        className={cn(
                          'relative overflow-visible border-b border-l border-slate-100 p-1',
                          busy && 'bg-blue-50/25',
                          dropActive && 'bg-blue-50/80 ring-2 ring-inset ring-blue-200'
                        )}
                        style={{ minHeight: SLOT_CELL_MIN_PX }}
                      >
                        {busy ? (
                          <div
                            className="flex h-full gap-0.5 overflow-visible"
                            style={{ minHeight: SLOT_CELL_MIN_PX - 8 }}
                          >
                            {Array.from({ length: laneCount }, (_, laneIndex) => {
                              const laneAppointment = overlapping.find(
                                (apt) => assignment.get(apt.id) === laneIndex
                              )
                              if (!laneAppointment) {
                                return (
                                  <button
                                    key={laneIndex}
                                    type="button"
                                    onClick={() => canBook && onSlotClick?.({ date: dateKey, time: slot, cabinaId: c.id })}
                                    disabled={!onSlotClick || !canBook}
                                    className="min-w-0 flex-1 rounded-lg transition-colors hover:bg-blue-50/60"
                                    aria-label={`Agendar ${slot} en ${c.name}`}
                                  />
                                )
                              }
                              const starting = appointmentStartsAtSlot(laneAppointment, slot)
                              if (starting) {
                                const blockHeight = calendarBlockHeight(laneAppointment.duration)
                                return (
                                  <div
                                    key={laneIndex}
                                    className="relative min-w-0 flex-1 overflow-visible"
                                    style={{ minHeight: blockHeight }}
                                  >
                                    <div
                                      className="absolute inset-x-0 top-0 z-20"
                                      style={{ height: `${blockHeight}px` }}
                                    >
                                      <AppointmentChip
                                        apt={laneAppointment}
                                        compact
                                        spanFullHeight
                                        canDrag={canDrag}
                                        dragging={dragState?.id === laneAppointment.id}
                                        onPointerDown={startDrag}
                                        onClick={handleChipClick}
                                      />
                                    </div>
                                  </div>
                                )
                              }
                              return (
                                <div
                                  key={laneIndex}
                                  className="pointer-events-none min-w-0 flex-1 rounded-lg bg-blue-100/25"
                                  aria-hidden="true"
                                  title="Horario ocupado por otra cita"
                                />
                              )
                            })}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => canBook && onSlotClick?.({ date: dateKey, time: slot, cabinaId: c.id })}
                            disabled={!onSlotClick || !canBook}
                            className="h-full w-full rounded-lg text-left transition-colors hover:bg-blue-50/50"
                            style={{ minHeight: SLOT_CELL_MIN_PX - 8 }}
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

      {dragState && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl border border-blue-200 bg-white px-3 py-2 shadow-2xl"
          style={{
            width: Math.max(160, dragState.width),
            left: dragState.x - Math.max(160, dragState.width) / 2,
            top: dragState.y - 20,
          }}
          data-testid="calendar-drag-ghost"
        >
          <p className="text-sm font-semibold text-slate-900">{dragState.label}</p>
          <p className="text-xs text-slate-500">{dragState.time}</p>
        </div>
      )}
    </Card>
  )
}
