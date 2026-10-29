import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import { useStaffName } from '@/modules/rrhh/lib/staff'
import { aptTone } from '../../lib/calendar'
import { appointmentWhatsAppFields, buildWhatsAppVariables } from '@/lib/whatsappVariables'
import { buildBookingUrl } from '../../lib/selfBooking'
import { appointmentCardNote, normalizeAppointmentNote } from '../../lib/appointments'

const TONES = {
  default: 'bg-blue-50 border-blue-100 text-blue-900 hover:bg-blue-100',
  pending: 'bg-red-50 border-red-100 text-red-900 hover:bg-red-100',
  trial: 'bg-violet-50 border-violet-100 text-violet-900 hover:bg-violet-100',
  cancelled: 'bg-slate-100 border-slate-200 text-slate-400 line-through',
}

const SPECIALIST_TONES = {
  default: 'bg-blue-200 text-blue-900',
  pending: 'bg-red-200 text-red-900',
  trial: 'bg-violet-200 text-violet-900',
}

const BADGE_CLASS = 'mt-0.5 inline-block max-w-full shrink-0 self-start truncate rounded px-1 py-px text-[10px] font-semibold'

export function AppointmentChip({
  apt,
  onClick,
  compact,
  spanFullHeight = false,
  canDrag = false,
  dragging = false,
  onPointerDown,
  showDayNote = false,
}) {
  const staffName = useStaffName()
  const tone = aptTone(apt)
  const fullNote = normalizeAppointmentNote(apt.notes)
  const cancelled = tone === 'cancelled'
  const awaitingSpecialist = !apt.employeeId && !cancelled
  const lookedUpName = apt.employeeId ? staffName(apt.employeeId) : ''
  const specialistName = apt.employeeName
    || (lookedUpName && lookedUpName !== '—' ? lookedUpName : 'Con especialista')
  const showNote = showDayNote && Boolean(fullNote)
  const hasPendingAmount = apt.pendingPayment && apt.pendingAmount > 0
  const showFooter = showNote || !showDayNote || hasPendingAmount
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(event) => onPointerDown?.(event, apt)}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(apt)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onClick?.(apt)
        }
      }}
      data-testid={`calendar-apt-${apt.id}`}
      className={cn(
        'relative w-full cursor-pointer overflow-hidden rounded-lg border text-left shadow-sm transition-colors',
        TONES[tone],
        spanFullHeight
          ? 'flex h-full min-h-0 flex-col p-1.5 leading-tight'
          : compact
            ? 'mb-1.5 p-1.5'
            : 'mb-2 p-2',
        canDrag && 'cursor-grab touch-none',
        dragging && 'cursor-grabbing opacity-50'
      )}
    >
      <span
        className="absolute right-1 top-1 z-10"
        data-no-calendar-drag
        onPointerDown={(event) => event.stopPropagation()}
      >
        <WhatsAppMenuButton
          phone={apt.customerPhone}
          context="agenda"
          size="xs"
          className="opacity-70 hover:opacity-100"
          variables={{
            ...buildWhatsAppVariables({ name: apt.customerName, phone: apt.customerPhone }),
            ...appointmentWhatsAppFields(apt),
            enlace: buildBookingUrl(apt.branchId),
          }}
          data-testid={`calendar-apt-wa-${apt.id}`}
        />
      </span>
      <p className={cn('min-w-0 truncate pr-6 font-semibold', compact ? 'text-[11px]' : 'text-xs')}>
        {apt.customerName}
      </p>
      {(spanFullHeight || apt.serviceName) && (
        <p
          className={cn(
            'min-w-0 truncate pr-6 opacity-80',
            spanFullHeight ? 'text-[11px]' : compact ? 'text-[10px]' : 'text-[11px]'
          )}
          title={apt.serviceName || 'Servicio'}
        >
          {apt.serviceName || 'Servicio'}
        </p>
      )}
      {awaitingSpecialist && (
        <span
          className={cn(BADGE_CLASS, 'bg-amber-100 text-amber-800')}
          data-testid={`calendar-apt-unassigned-${apt.id}`}
        >
          Sin especialista
        </span>
      )}
      {apt.employeeId && !cancelled && (
        <span
          className={cn(BADGE_CLASS, SPECIALIST_TONES[tone] || SPECIALIST_TONES.default)}
          title={specialistName}
          data-testid={`calendar-apt-specialist-${apt.id}`}
        >
          {specialistName}
        </span>
      )}
      {showFooter && (
        <div
          className={cn(
            'flex items-end justify-between gap-1',
            spanFullHeight ? 'mt-auto shrink-0 pt-0.5' : 'mt-1'
          )}
        >
          {showNote ? (
            <span
              className={cn(
                'line-clamp-2 min-w-0 flex-1 break-words font-bold',
                compact ? 'text-[10px]' : 'text-[11px]'
              )}
              title={fullNote}
              aria-label={`Nota: ${fullNote}`}
            >
              {appointmentCardNote(fullNote)}
            </span>
          ) : !showDayNote ? (
            <span className={cn('min-w-0 truncate font-bold', compact ? 'text-[10px]' : 'text-[11px]')}>
              {apt.time}
            </span>
          ) : null}
          {hasPendingAmount && (
            <span className="shrink-0 text-[10px] font-semibold text-red-600">Pendiente {formatDOP(apt.pendingAmount)}</span>
          )}
        </div>
      )}
    </div>
  )
}
