import { CalendarX } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { fmtDate } from '@/modules/crm/lib/crm'
import { formatTime12h } from '@/modules/agenda/lib/calendar'

export function PortalCancelAppointmentModal({
  open,
  appointment,
  busy,
  onClose,
  onConfirm,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancelar cita"
      testId="portal-cancel-appointment-modal"
      bodyClassName="space-y-5"
    >
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100"
          aria-hidden
        >
          <CalendarX className="h-6 w-6" />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm leading-relaxed text-slate-600">
            ¿Cancelar esta cita y liberar el horario? Esta acción no se puede deshacer.
          </p>
          {appointment ? (
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-left text-sm ring-1 ring-slate-100">
              <p className="font-semibold text-slate-900">{appointment.serviceName}</p>
              <p className="text-slate-500">
                {fmtDate(appointment.date)} · {formatTime12h(appointment.time)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={onClose}
          data-testid="portal-cancel-keep"
        >
          Conservar cita
        </Button>
        <Button
          variant="dangerSolid"
          size="sm"
          disabled={busy}
          onClick={onConfirm}
          data-testid="portal-cancel-confirm"
        >
          {busy ? 'Cancelando…' : 'Sí, cancelar cita'}
        </Button>
      </div>
    </Modal>
  )
}
