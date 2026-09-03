import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatShortDate } from '../lib/calendar'

export function DeleteAppointmentModal({ appointment, loading, onClose, onConfirm }) {
  const open = Boolean(appointment)

  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose()}
      title="Eliminar cita"
      testId="delete-appointment-modal"
    >
      <div className="space-y-5">
        <div className="flex gap-3 rounded-xl bg-red-50 p-4 text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">¿Realmente quieres eliminar este registro?</p>
            <p className="mt-1 text-sm text-red-600">
              La cita dejará de aparecer en la agenda, pero conservará su historial para auditoría.
            </p>
          </div>
        </div>

        {appointment && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Cliente</dt>
            <dd className="font-medium text-slate-900">{appointment.customerName}</dd>
            <dt className="text-slate-500">Fecha y hora</dt>
            <dd className="font-medium capitalize text-slate-900">
              {formatShortDate(appointment.date)} · {appointment.time}
            </dd>
            <dt className="text-slate-500">Servicio</dt>
            <dd className="font-medium text-slate-900">{appointment.serviceName || '—'}</dd>
          </dl>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            data-testid="delete-appointment-cancel"
          >
            Volver
          </Button>
          <Button
            type="button"
            variant="dangerSolid"
            onClick={onConfirm}
            disabled={loading}
            data-testid="delete-appointment-confirm"
          >
            <Trash2 className="h-4 w-4" />
            {loading ? 'Eliminando…' : 'Eliminar cita'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
