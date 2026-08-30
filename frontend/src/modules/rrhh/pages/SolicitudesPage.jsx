import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Calendar, Check, X } from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useConfigStore } from '@/stores/configStore'
import { REQUEST_STATUS_META } from '@/data/rrhh'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { fullName, daysBetween } from '../lib/rrhh'
import { useSessionStore } from '@/stores/sessionStore'

const APPROVER_ROLES = ['Administrador', 'Gerente', 'Supervisor']

export default function SolicitudesPage() {
  const employees = useRrhhStore((s) => s.employees)
  const vacationRequests = useRrhhStore((s) => s.vacationRequests)
  const getEmployeeByUserId = useRrhhStore((s) => s.getEmployeeByUserId)
  const addVacationRequest = useRrhhStore((s) => s.addVacationRequest)
  const reviewVacationRequest = useRrhhStore((s) => s.reviewVacationRequest)
  const users = useConfigStore((s) => s.users)
  const currentUserId = useSessionStore((s) => s.user?.userId || s.user?.id)
  const hasPermission = useSessionStore((s) => s.hasPermission)

  const currentUser = users.find((u) => u.id === currentUserId)
  const linkedEmployee = getEmployeeByUserId(currentUserId)
  const canApprove = hasPermission('hr.leave.review') || APPROVER_ROLES.includes(currentUser?.role)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  const myRequests = useMemo(
    () => (linkedEmployee ? vacationRequests.filter((r) => r.employeeId === linkedEmployee.id) : []),
    [vacationRequests, linkedEmployee]
  )

  const pendingForApproval = useMemo(
    () => vacationRequests.filter((r) => r.status === 'pendiente'),
    [vacationRequests]
  )

  const usedDays = useMemo(() => {
    if (!linkedEmployee) return 0
    return vacationRequests
      .filter((r) => r.employeeId === linkedEmployee.id && r.status === 'aprobada')
      .reduce((sum, r) => sum + daysBetween(r.startDate, r.endDate), 0)
  }, [vacationRequests, linkedEmployee])

  const availableDays = (linkedEmployee?.vacationDays || 0) - usedDays

  const submitRequest = async () => {
    if (!startDate || !endDate) return toast.error('Selecciona el rango de fechas')
    if (new Date(endDate) < new Date(startDate)) return toast.error('La fecha fin debe ser posterior')
    if (!reason.trim()) return toast.error('Ingresa un motivo')
    const days = daysBetween(startDate, endDate)
    if (days > availableDays) return toast.error('No tienes suficientes días disponibles')
    try {
      await addVacationRequest({ employeeId: linkedEmployee.id, startDate, endDate, reason: reason.trim() })
      toast.success('Solicitud enviada')
      setStartDate('')
      setEndDate('')
      setReason('')
    } catch (error) {
      toast.error(error.message || 'No se pudo enviar la solicitud')
    }
  }

  const reviewRequest = async (requestId, status) => {
    try {
      await reviewVacationRequest(requestId, status, currentUserId)
      toast.success(status === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada')
    } catch (error) {
      toast.error(error.message || 'No se pudo revisar la solicitud')
    }
  }

  if (!linkedEmployee) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 sm:p-8" data-testid="rrhh-solicitudes-locked">
        <Card className="border-amber-200 bg-amber-50/50 p-6">
          <div className="flex gap-4 items-start">
            <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-amber-900">Usuario no Vinculado</h3>
              <p className="text-sm text-amber-800">
                Tu cuenta de usuario no está asociada a ningún empleado en el Directorio de RRHH. Para poder solicitar vacaciones, ver tus días disponibles o aprobar solicitudes de otros empleados, pide a tu administrador que edite tu ficha en{' '}
                <Link to="/rrhh/directorio" className="font-semibold underline">RRHH &gt; Directorio</Link>{' '}
                y asocie tu cuenta.
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8" data-testid="rrhh-solicitudes">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Días disponibles</p>
          <p className="mt-1 font-heading text-3xl font-bold text-emerald-600">{availableDays}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Días usados</p>
          <p className="mt-1 font-heading text-3xl font-bold text-slate-700">{usedDays}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Total asignados</p>
          <p className="mt-1 font-heading text-3xl font-bold text-blue-600">{linkedEmployee.vacationDays}</p>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="mb-4 font-heading font-semibold text-slate-900">Nueva solicitud de vacaciones</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Fecha inicio</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Fecha fin</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Motivo</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe el motivo de tu solicitud" />
          </div>
        </div>
        <Button className="mt-4" onClick={submitRequest}>
          <Calendar className="h-4 w-4" />
          Enviar solicitud
        </Button>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 font-heading font-semibold text-slate-900">Mis solicitudes</h3>
        {myRequests.length === 0 ? (
          <p className="text-sm text-slate-500">No has enviado solicitudes aún.</p>
        ) : (
          <div className="space-y-3">
            {myRequests.map((r) => {
              const meta = REQUEST_STATUS_META[r.status] || REQUEST_STATUS_META.pendiente
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
                  <div>
                    <p className="font-medium text-slate-800">{r.startDate} — {r.endDate}</p>
                    <p className="text-sm text-slate-500">{r.reason}</p>
                    <p className="text-xs text-slate-400">{daysBetween(r.startDate, r.endDate)} días</p>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {canApprove && pendingForApproval.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 font-heading font-semibold text-slate-900">Pendientes de aprobación</h3>
          <div className="space-y-3">
            {pendingForApproval.map((r) => {
              const emp = employees.find((e) => e.id === r.employeeId)
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/30 p-4">
                  <div>
                    <p className="font-medium text-slate-800">{fullName(emp)}</p>
                    <p className="text-sm text-slate-600">{r.startDate} — {r.endDate} · {r.reason}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => reviewRequest(r.id, 'rechazada')}>
                      <X className="h-4 w-4" /> Rechazar
                    </Button>
                    <Button size="sm" onClick={() => reviewRequest(r.id, 'aprobada')}>
                      <Check className="h-4 w-4" /> Aprobar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
