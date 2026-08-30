import { Clock, User, Calendar, History } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useConfigStore } from '@/stores/configStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { statusMeta } from '@/stores/agendaStore'
import { actionLabel, fmtAuditWhen, sourceLabel } from '@/modules/agenda/lib/audit'
import { cn } from '@/lib/utils'

function resolveEmployeeName(id, employees) {
  const rrhh = employees.find((e) => e.id === id)
  if (rrhh) return `${rrhh.firstName} ${rrhh.lastName}`
  return id || '—'
}

export function AppointmentAuditModal({ open, onClose, appointment }) {
  const branches = useConfigStore((s) => s.branches)
  const employees = useRrhhStore((s) => s.employees)

  if (!appointment) return null

  const st = statusMeta(appointment.status)
  const branchName = branches.find((b) => b.id === appointment.branchId)?.name || '—'
  const employeeName = resolveEmployeeName(appointment.employeeId, employees)
  const history = [...(appointment.history || [])].sort((a, b) => new Date(b.at) - new Date(a.at))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Auditoría de cita"
      testId="appointment-audit-modal"
      wide
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-heading text-lg font-bold text-slate-900">{appointment.customerName}</p>
              <p className="mt-1 text-sm text-slate-500">{appointment.serviceName || '—'}</p>
            </div>
            <Badge tone={st.tone}>{st.name}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Calendar className="h-4 w-4 text-blue-500" />
              {appointment.date} · {appointment.time}
            </p>
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <User className="h-4 w-4 text-violet-500" />
              {employeeName}
            </p>
          </div>
        </div>

        <dl className="grid gap-3 rounded-xl border border-slate-100 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Agendado por</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{appointment.createdBy || '—'}</dd>
            <dd className="text-xs text-slate-500">{fmtAuditWhen(appointment.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Última edición</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{appointment.updatedBy || '—'}</dd>
            <dd className="text-xs text-slate-500">{fmtAuditWhen(appointment.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Origen</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{sourceLabel(appointment.source)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sucursal</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{branchName}</dd>
          </div>
        </dl>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <h3 className="font-heading text-sm font-bold text-slate-800">Historial de cambios</h3>
          </div>

          {history.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              No hay movimientos registrados para esta cita.
            </p>
          ) : (
            <ul className="space-y-3">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
                  data-testid={`audit-entry-${entry.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{actionLabel(entry.action)}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-medium text-slate-600">{entry.userName || 'Sistema'}</span>
                        {' · '}
                        {fmtAuditWhen(entry.at)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        entry.action === 'create' && 'bg-emerald-50 text-emerald-700',
                        entry.action === 'update' && 'bg-blue-50 text-blue-700',
                        entry.action === 'status' && 'bg-amber-50 text-amber-700'
                      )}
                    >
                      {entry.action}
                    </span>
                  </div>

                  {entry.changes?.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      {entry.changes.map((ch) => (
                        <li key={`${entry.id}-${ch.field}`} className="text-xs leading-relaxed text-slate-600">
                          <span className="font-semibold text-slate-700">{ch.label}:</span>{' '}
                          <span className="text-slate-400">{ch.from}</span>
                          <span className="mx-1 text-slate-300">→</span>
                          <span className="font-medium text-slate-800">{ch.to}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          Los cambios a partir de ahora registran usuario, campo modificado y fecha/hora.
        </p>
      </div>
    </Modal>
  )
}
