import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import { formatShortDate, aptTone } from '../../lib/calendar'

const TONES = {
  default: 'bg-blue-50 border-blue-100 text-blue-900 hover:bg-blue-100',
  pending: 'bg-red-50 border-red-100 text-red-900 hover:bg-red-100',
  trial: 'bg-violet-50 border-violet-100 text-violet-900 hover:bg-violet-100',
  cancelled: 'bg-slate-100 border-slate-200 text-slate-400 line-through',
}

export function AppointmentChip({ apt, onClick, compact }) {
  const tone = aptTone(apt)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(apt)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onClick?.(apt)
        }
      }}
      data-testid={`calendar-apt-${apt.id}`}
      className={cn(
        'w-full cursor-pointer rounded-lg border p-2 text-left shadow-sm transition-colors',
        TONES[tone],
        compact ? 'mb-1.5 p-1.5' : 'mb-2'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className={cn('truncate font-semibold', compact ? 'text-[11px]' : 'text-xs')}>{apt.customerName}</span>
        <WhatsAppMenuButton
          phone={apt.customerPhone}
          context="agenda"
          size="xs"
          className="opacity-70 hover:opacity-100"
          variables={{
            nombre_cliente: apt.customerName || '',
            fecha: formatShortDate(apt.date),
            hora: apt.time || '',
            servicio: apt.serviceName || '',
          }}
          data-testid={`calendar-apt-wa-${apt.id}`}
        />
      </div>
      {apt.serviceName && (
        <p className={cn('truncate opacity-80', compact ? 'text-[10px]' : 'text-[11px]')}>{apt.serviceName}</p>
      )}
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className={cn('font-bold', compact ? 'text-[10px]' : 'text-[11px]')}>{apt.time}</span>
        {apt.pendingPayment && apt.pendingAmount > 0 && (
          <span className="text-[10px] font-semibold text-red-600">Pendiente {formatDOP(apt.pendingAmount)}</span>
        )}
      </div>
    </div>
  )
}
