import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Clock, UserRound } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useRrhhStore } from '@/stores/rrhhStore'
import { fullName } from '@/modules/rrhh/lib/rrhh'
import { employeeWorksAtBranch } from '@/modules/rrhh/lib/staff'
import { isSelectableAsSpecialist } from '@/modules/rrhh/lib/staff'
import {
  WEEKDAY_KEYS,
  WEEKDAY_SHORT,
  hasConfiguredSchedule,
  normalizeWorkSchedule,
  summarizeDayBlocks,
  summarizeSchedule,
} from '@/modules/rrhh/lib/schedule'
import { fromKey } from '../lib/calendar'
import { cn } from '@/lib/utils'

const JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function BranchSchedulesModal({ open, onClose, branchId, branchName, referenceDate }) {
  const employees = useRrhhStore((s) => s.employees)

  const referenceDayKey = useMemo(() => {
    if (!referenceDate) return null
    try {
      return JS_DAY_TO_KEY[fromKey(referenceDate).getDay()]
    } catch {
      return null
    }
  }, [referenceDate])

  const branchEmployees = useMemo(
    () =>
      employees
        .filter((employee) => employee.active && employeeWorksAtBranch(employee, branchId))
        .sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [employees, branchId]
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Horarios — ${branchName || 'Sucursal'}`}
      testId="branch-schedules-modal"
      xlarge
      bodyClassName="max-h-[min(85vh,720px)] overflow-y-auto"
    >
      <p className="mb-4 text-sm text-slate-500">
        Horarios semanales del personal en esta sucursal. Los cupos de citas y la agenda en línea usan estos bloques
        (si no hay horario definido, se asume 8:00–20:00).
      </p>

      {branchEmployees.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No hay empleados activos asignados a esta sucursal.
        </p>
      ) : (
        <div className="space-y-4">
          {branchEmployees.map((employee) => {
            const schedule = normalizeWorkSchedule(employee.workSchedule)
            const configured = hasConfiguredSchedule(schedule)
            return (
              <article
                key={employee.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                data-testid={`branch-schedule-employee-${employee.id}`}
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <UserRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{fullName(employee)}</p>
                      <p className="truncate text-xs text-slate-500">{employee.position || 'Sin cargo'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                      {configured ? summarizeSchedule(schedule) : 'Horario general 8:00–20:00'}
                    </span>
                    {isSelectableAsSpecialist(employee) && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                        Agenda en línea
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {WEEKDAY_KEYS.map((day) => {
                    const blocks = schedule[day] || []
                    const label = summarizeDayBlocks(blocks)
                    const isReference = day === referenceDayKey
                    return (
                      <div
                        key={day}
                        className={cn(
                          'rounded-xl border px-2.5 py-2 text-xs',
                          isReference ? 'border-blue-200 bg-blue-50/60' : 'border-slate-100 bg-slate-50/80'
                        )}
                      >
                        <p className={cn('mb-1 font-bold uppercase tracking-wide', isReference ? 'text-blue-700' : 'text-slate-500')}>
                          {WEEKDAY_SHORT[day]}
                        </p>
                        <p className={cn('leading-snug', configured && blocks.length ? 'text-slate-700' : 'text-slate-400')}>
                          {configured ? (blocks.length ? label : 'Libre') : '8:00–20:00'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Para cambiar bloques, edita el empleado en RRHH.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Link
            to="/rrhh/directorio"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            data-testid="branch-schedules-go-rrhh"
          >
            Ir a directorio RRHH
          </Link>
        </div>
      </div>
    </Modal>
  )
}
