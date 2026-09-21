import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import { aptTone } from '../../lib/calendar'
import { appointmentWhatsAppFields, buildWhatsAppVariables } from '@/lib/whatsappVariables'
import { buildBookingUrl } from '../../lib/selfBooking'

const TONES = {
  default: 'bg-blue-50 border-blue-100 text-blue-900 hover:bg-blue-100',
  pending: 'bg-red-50 border-red-100 text-red-900 hover:bg-red-100',
  trial: 'bg-violet-50 border-violet-100 text-violet-900 hover:bg-violet-100',
  cancelled: 'bg-slate-100 border-slate-200 text-slate-400 line-through',
}

export function AppointmentChip({
  apt,
  onClick,
  compact,
  spanFullHeight = false,
  canDrag = false,
  dragging = false,
  onPointerDown,
}) {
  const tone = aptTone(apt)
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
        'w-full cursor-pointer rounded-lg border text-left shadow-sm transition-colors',
        TONES[tone],
        spanFullHeight
          ? 'flex h-full min-h-0 flex-col overflow-hidden p-1 leading-tight'
          : compact
            ? 'mb-1.5 p-1.5'
            : 'mb-2 p-2',
        canDrag && 'cursor-grab touch-none',
        dragging && 'cursor-grabbing opacity-50'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-1">
        <span className={cn('min-w-0 truncate font-semibold', compact ? 'text-[11px]' : 'text-xs')}>{apt.customerName}</span>
        <span data-no-calendar-drag onPointerDown={(event) => event.stopPropagation()}>
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
      </div>
      {apt.serviceName && (
        <p className={cn('min-w-0 truncate opacity-80', compact ? 'text-[10px]' : 'text-[11px]')}>{apt.serviceName}</p>
      )}
      <div
        className={cn(
          'flex items-center justify-between gap-1',
          spanFullHeight ? 'mt-auto shrink-0' : 'mt-1'
        )}
      >
        <span className={cn('font-bold', compact ? 'text-[10px]' : 'text-[11px]')}>{apt.time}</span>
        {apt.pendingPayment && apt.pendingAmount > 0 && (
          <span className="text-[10px] font-semibold text-red-600">Pendiente {formatDOP(apt.pendingAmount)}</span>
        )}
      </div>
    </div>
  )
}
