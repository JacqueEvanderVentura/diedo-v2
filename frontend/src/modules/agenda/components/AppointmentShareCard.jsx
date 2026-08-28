import { forwardRef } from 'react'
import { Calendar, Clock, User } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { useStaffName } from '@/modules/rrhh/lib/staff'
import { statusMeta } from '@/stores/agendaStore'
import { formatLongDate, endTime } from '../lib/calendar'
import { isProximoAppointment } from '../lib/appointments'
import { cn } from '@/lib/utils'

export const AppointmentShareCard = forwardRef(function AppointmentShareCard(
  { appointment, className, showAudit = true },
  ref
) {
  const staffName = useStaffName()
  if (!appointment) return null

  const proximo = isProximoAppointment(appointment)
  const st = statusMeta(appointment.status)
  const specialist = staffName(appointment.employeeId)
  const initials = (appointment.customerName || 'C').slice(0, 1).toUpperCase()

  return (
    <div
      ref={ref}
      className={cn('w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white', className)}
      data-testid="appointment-share-card"
    >
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-400 text-lg font-bold">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate font-heading text-base font-bold">{appointment.customerName}</p>
              {appointment.customerPhone && (
                <p className="truncate text-xs text-blue-100">{appointment.customerPhone}</p>
              )}
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
              proximo ? 'bg-amber-300 text-amber-950' : 'bg-indigo-400 text-white'
            )}
          >
            {proximo ? 'Próximo' : st.name}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5 text-sm text-slate-600">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <span className="font-medium capitalize leading-snug">{formatLongDate(appointment.date)}</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
            <Clock className="h-4 w-4 shrink-0 text-blue-600" />
            <div className="min-w-0">
              <p className="whitespace-nowrap font-heading text-lg font-bold tabular-nums tracking-tight text-slate-900">
                {appointment.time}
                <span className="mx-2 font-normal text-slate-400">–</span>
                {endTime(appointment.time, appointment.duration)}
              </p>
              {appointment.duration ? (
                <p className="text-xs font-medium text-slate-500">{appointment.duration} min</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5">
          <p className="font-semibold leading-snug text-slate-900">{appointment.serviceName || 'Servicio'}</p>
          <div className="mt-2.5 flex items-start justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-slate-500">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span>{specialist !== '—' ? specialist : 'Especialista por asignar'}</span>
            </p>
            <p className="shrink-0 whitespace-nowrap font-heading text-sm font-bold tabular-nums text-blue-600">
              {formatDOP(appointment.price || 0)}
            </p>
          </div>
        </div>

        {showAudit && (appointment.createdBy || appointment.updatedBy) && (
          <div className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
            {appointment.createdBy && <p>Creado por <span className="font-medium text-slate-600">{appointment.createdBy}</span></p>}
            {appointment.updatedBy && <p>Editado por <span className="font-medium text-slate-600">{appointment.updatedBy}</span></p>}
          </div>
        )}
      </div>
    </div>
  )
})
