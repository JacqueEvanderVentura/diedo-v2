import { Modal } from '@/components/ui/Modal'
import { IMPORT_STACK_NOTE_MARKER } from '@/modules/agenda/lib/importStacked'

export function ImportStackedAppointmentsModal({ open, onClose, appointments = [] }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Citas importadas en el mismo horario"
      testId="import-stacked-modal"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Estas citas comparten cabina, fecha y hora porque se importaron así en el archivo.
          Solo se agrupan en la agenda por ese motivo; revísalas y ajusta si hace falta.
        </p>
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {appointments.map((apt) => (
            <li
              key={apt.id}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
            >
              <p className="font-semibold">{apt.customerName}</p>
              <p className="text-xs text-slate-500">
                {[apt.date, apt.time, apt.serviceName, apt.resourceName].filter(Boolean).join(' · ')}
              </p>
              {apt.notes?.includes(IMPORT_STACK_NOTE_MARKER) ? (
                <p className="mt-1 text-xs text-amber-800">{IMPORT_STACK_NOTE_MARKER}.</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
