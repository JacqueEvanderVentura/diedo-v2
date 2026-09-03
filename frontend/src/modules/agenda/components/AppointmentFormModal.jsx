import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Save, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { APPOINTMENT_STATUSES, useAgendaStore, todayKey } from '@/stores/agendaStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useCustomersStore } from '@/stores/customersStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { AppointmentShareCard } from './AppointmentShareCard'
import { AppointmentShareActions } from './AppointmentShareActions'
import { CustomerPicker } from '@/components/customers/CustomerPicker'
import {
  DURATION_OPTIONS,
  RECURRENCE_OPTIONS,
  REPEAT_COUNTS,
} from '@/data/agenda'
import { useBranchStaff } from '@/modules/rrhh/lib/staff'
import { getAvailableSlots, fitsInSchedule } from '../lib/selfBooking'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isAppointmentConflict } from '@/services/adapters/appointments'
import { useSessionStore } from '@/stores/sessionStore'
import { servicesForBranch } from '../lib/serviceAvailability'
import {
  APPOINTMENT_RECEIVABLE_PERMISSION_NOTE,
  getAppointmentReceivablePolicy,
} from '../lib/receivablePermissions'

const EMPTY_SLOT = Object.freeze({})

const empty = (date, customerId, slot = {}) => ({
  date: slot.date || date || todayKey(),
  time: slot.time || '08:00',
  duration: 30,
  customerId: customerId || 'walk-in',
  customerName: '',
  customerPhone: '',
  serviceId: '',
  employeeId: slot.employeeId || '',
  branchId: slot.branchId || '',
  cabinaId: slot.cabinaId || '',
  status: 'confirmada',
  notes: '',
  pendingPayment: false,
  pendingAmount: 0,
  firstTime: false,
  freeTrial: false,
  completed: false,
  recurrence: 'none',
  repeatCount: 2,
  reminderSent: true,
})

export function AppointmentFormModal({ open, onClose, appointment, defaultDate, defaultCustomerId, defaultSlot = EMPTY_SLOT, wide = true }) {
  const addAppointment = useAgendaStore((s) => s.addAppointment)
  const updateAppointment = useAgendaStore((s) => s.updateAppointment)
  const resources = useAgendaStore((s) => s.resources)
  const resourceLoadingByBranch = useAgendaStore((s) => s.resourceLoadingByBranch)
  const hydrateResources = useAgendaStore((s) => s.hydrateResources)
  const customers = useCustomersStore((s) => s.customers)
  const allProducts = useCatalogStore((s) => s.products)
  const branches = useConfigStore((s) => s.branches)
  const employees = useRrhhStore((s) => s.employees)
  const vacationRequests = useRrhhStore((s) => s.vacationRequests)
  const appointments = useAgendaStore((s) => s.appointments)
  const canManage = useSessionStore((s) => s.hasPermission('appointment.manage'))
  const canManageReceivables = useSessionStore((s) => s.hasPermission('pos.receivables.manage'))
  const sessionStatus = useSessionStore((s) => s.status)
  const catalogHydrated = useCatalogStore((s) => s.apiContext.hydrated)

  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!appointment
  const servicesReady = sessionStatus === 'demo' || catalogHydrated
  const services = useMemo(
    () => servicesForBranch(allProducts, form.branchId, { online: sessionStatus === 'online' }),
    [allProducts, form.branchId, sessionStatus]
  )

  useEffect(() => {
    if (open) {
      const branchId = appointment?.branchId || defaultSlot.branchId || branches[0]?.id || ''
      setForm(appointment
        ? { ...appointment, branchId }
        : empty(defaultDate, defaultCustomerId, { ...defaultSlot, branchId }))
      setErr('')
      setSaving(false)
    }
  }, [open, appointment, defaultDate, defaultCustomerId, defaultSlot, branches])

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErr('')
  }

  const selectedService = useMemo(() => services.find((s) => s.id === form.serviceId), [services, form.serviceId])
  const receivablePolicy = getAppointmentReceivablePolicy({
    appointment: form,
    online: sessionStatus === 'online',
    canManageReceivables,
  })
  const statusOptions = editing
    ? APPOINTMENT_STATUSES
    : APPOINTMENT_STATUSES.filter((status) => ['pendiente', 'confirmada'].includes(status.id))
  const price = selectedService?.price || form.price || 0
  const branchStaff = useBranchStaff(form.branchId)
  const branchResources = useMemo(
    () => resources.filter((resource) => resource.branchId === form.branchId && resource.active !== false),
    [form.branchId, resources]
  )
  const resourcesLoading = resourceLoadingByBranch[form.branchId] === true
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === form.employeeId),
    [employees, form.employeeId]
  )

  const availableSlots = useMemo(
    () =>
      form.employeeId && form.date
        ? getAvailableSlots({
            date: form.date,
            employeeId: form.employeeId,
            duration: form.duration,
            appointments,
            employee: selectedEmployee,
            vacationRequests,
            excludeAppointmentId: appointment?.id,
          })
        : [],
    [
      form.employeeId,
      form.date,
      form.duration,
      appointments,
      selectedEmployee,
      vacationRequests,
      appointment?.id,
    ]
  )

  useEffect(() => {
    if (!form.employeeId) return
    if (!branchStaff.some((e) => e.id === form.employeeId)) {
      setForm((f) => ({ ...f, employeeId: '' }))
    }
  }, [form.branchId, branchStaff, form.employeeId])

  useEffect(() => {
    if (!open || !form.branchId) return
    hydrateResources({ branchId: form.branchId }).catch(() => {})
  }, [form.branchId, hydrateResources, open])

  useEffect(() => {
    if (!open || !form.branchId || resourcesLoading) return
    const currentResourceIsValid = branchResources.some(
      (resource) => resource.id === form.cabinaId
    )
    if (!currentResourceIsValid) {
      setForm((current) => ({
        ...current,
        cabinaId: branchResources[0]?.id || '',
      }))
    }
  }, [branchResources, form.branchId, form.cabinaId, open, resourcesLoading])

  useEffect(() => {
    if (!open || !servicesReady || !form.serviceId) return
    if (!services.some((service) => service.id === form.serviceId)) {
      setForm((current) => ({ ...current, serviceId: '', serviceName: '', price: 0 }))
    }
  }, [form.serviceId, open, services, servicesReady])

  const changeBranch = (branchId) => {
    setForm((current) => ({
      ...current,
      branchId,
      serviceId: '',
      serviceName: '',
      price: 0,
      cabinaId: '',
      employeeId: '',
    }))
    setErr('')
  }

  const pickCustomer = (c) => {
    setForm((f) => ({
      ...f,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone || '',
    }))
  }

  const selectedCustomer = useMemo(
    () => ({
      id: form.customerId,
      name: form.customerName || customers.find((c) => c.id === form.customerId)?.name || '',
      phone: form.customerPhone || customers.find((c) => c.id === form.customerId)?.phone || '',
    }),
    [form.customerId, form.customerName, form.customerPhone, customers]
  )

  const buildPayload = () => {
    const customer = customers.find((c) => c.id === form.customerId)
    return {
      ...form,
      customerName: form.customerName || customer?.name || 'Cliente',
      customerPhone: form.customerPhone || customer?.phone || '',
      serviceName: selectedService?.name || form.serviceName || '',
      price,
    }
  }

  const submit = async () => {
    if (saving) return
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    if (!resourcesLoading && branchResources.length === 0) {
      return setErr('La sucursal seleccionada no tiene cabinas o recursos activos.')
    }
    if (!form.cabinaId) return setErr('Selecciona una cabina o recurso.')
    if (!selectedService) return setErr('Selecciona un servicio disponible en esa sucursal.')
    if (!form.date) return setErr('Selecciona una fecha.')
    if (!form.time) return setErr('Selecciona una hora.')
    if (
      selectedEmployee &&
      !fitsInSchedule({
        employee: selectedEmployee,
        date: form.date,
        time: form.time,
        duration: form.duration,
      })
    ) {
      return setErr('La hora seleccionada está fuera del horario del empleado.')
    }
    if (form.employeeId && !availableSlots.includes(form.time)) {
      return setErr('Ese horario ya no está disponible para el empleado.')
    }
    const payload = buildPayload()
    setSaving(true)
    setErr('')
    try {
      if (editing) {
        await updateAppointment(appointment.id, payload)
        toast.success('Cita actualizada')
      } else {
        const created = await addAppointment(payload)
        const count = Array.isArray(created) ? created.length : 1
        toast.success(count > 1 ? `${count} citas agendadas` : 'Cita agendada')
      }
      onClose()
    } catch (error) {
      if (isAppointmentConflict(error)) {
        setErr(error.message || 'Ese horario acaba de ser ocupado. Selecciona otro disponible.')
      } else {
        setErr(error.message || 'No se pudo guardar la cita. Intenta nuevamente.')
      }
    } finally {
      setSaving(false)
    }
  }

  const previewAppointment = useMemo(
    () => ({
      ...form,
      customerName: form.customerName || customers.find((c) => c.id === form.customerId)?.name || 'Cliente',
      serviceName: selectedService?.name || form.serviceName || 'Servicio',
      price,
      createdBy: appointment?.createdBy,
      updatedBy: appointment?.updatedBy,
    }),
    [form, customers, selectedService, price, appointment]
  )

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar cita' : 'Nueva Cita'} testId="appointment-form-modal" wide={wide}>
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <AppointmentShareCard appointment={previewAppointment} showAudit={editing} />
          {editing && <AppointmentShareActions appointment={previewAppointment} />}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Servicio</label>
            <Select
              value={form.serviceId}
              onChange={(v) => set('serviceId', v)}
              placeholder="Seleccionar Servicio"
              options={services.map((s) => ({ value: s.id, label: `${s.name} — ${formatDOP(s.price)}` }))}
              data-testid="appointment-field-service"
            />
            {servicesReady && form.branchId && services.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600" data-testid="appointment-no-services">
                Esta sucursal no tiene servicios activos configurados.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Empleado</label>
            <Select
              value={form.employeeId}
              onChange={(v) => set('employeeId', v)}
              placeholder="Seleccionar Empleado"
              options={branchStaff.map((e) => ({ value: e.id, label: e.name }))}
              data-testid="appointment-field-employee"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label>
            <Select
              value={form.branchId}
              onChange={changeBranch}
              placeholder="Seleccionar sucursal"
              options={branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))}
              data-testid="appointment-field-branch"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Cabina</label>
            <Select
              value={form.cabinaId}
              onChange={(v) => set('cabinaId', v)}
              placeholder="Seleccionar Cabina"
              options={branchResources.map((resource) => ({ value: resource.id, label: resource.name }))}
              data-testid="appointment-field-cabina"
            />
            {!resourcesLoading && form.branchId && branchResources.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600" data-testid="appointment-no-resources">
                Esta sucursal no tiene cabinas o recursos activos.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha</label>
            <Input type="date" value={form.date} onChange={(e) => { set('date', e.target.value); setErr('') }} data-testid="appointment-field-date" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Hora</label>
            {form.employeeId && form.date ? (
              <div className="space-y-2">
                {availableSlots.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    No hay cupos según el horario del empleado.
                  </p>
                ) : (
                  <div className="grid max-h-36 grid-cols-4 gap-2 overflow-y-auto rounded-xl border border-slate-100 p-2 sm:grid-cols-5">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => { set('time', slot); setErr('') }}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-xs font-semibold transition-colors',
                          form.time === slot
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-600 hover:border-blue-200'
                        )}
                        data-testid={`appointment-slot-${slot}`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Input type="time" value={form.time} onChange={(e) => { set('time', e.target.value); setErr('') }} data-testid="appointment-field-time" />
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Duración</label>
            <Select
              value={form.duration}
              onChange={(v) => set('duration', Number(v))}
              options={DURATION_OPTIONS}
              data-testid="appointment-field-duration"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-600">Cliente</label>
          <CustomerPicker
            value={selectedCustomer}
            onChange={pickCustomer}
            testIdPrefix="appointment-customer"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre Cliente</label>
            <Input value={form.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Nombre del cliente" data-testid="appointment-field-name" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono Cliente</label>
            <Input value={form.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} placeholder="Teléfono del cliente" data-testid="appointment-field-phone" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Notas</label>
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notas adicionales" data-testid="appointment-field-notes" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Estatus</label>
            <Select
              value={form.status}
              onChange={(value) => {
                setForm((current) => ({ ...current, status: value, completed: value === 'completada' }))
                setErr('')
              }}
              options={statusOptions.map((s) => ({
                value: s.id,
                label: s.name,
                disabled: s.id === 'cancelada' && !receivablePolicy.canCancel,
              }))}
              data-testid="appointment-field-status"
            />
          </div>
          {editing && (
            <label className="flex items-center gap-2 pt-8 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={form.completed}
                onChange={(event) => {
                  const completed = event.target.checked
                  setForm((current) => ({
                    ...current,
                    completed,
                    status: completed ? 'completada' : 'confirmada',
                  }))
                  setErr('')
                }}
                data-testid="appointment-field-completed"
              />
              Completada
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.pendingPayment} disabled={!receivablePolicy.canManagePending} onChange={(e) => set('pendingPayment', e.target.checked)} data-testid="appointment-field-pending" />
            Pendiente de pago
          </label>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto pendiente</label>
            <Input type="number" min="0" disabled={!form.pendingPayment || !receivablePolicy.canManagePending} value={form.pendingAmount || ''} onChange={(e) => set('pendingAmount', e.target.value)} data-testid="appointment-field-pending-amount" />
          </div>
          {!receivablePolicy.canManagePending && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 sm:col-span-2" data-testid="appointment-pending-permission-note">
              {APPOINTMENT_RECEIVABLE_PERMISSION_NOTE}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.firstTime} onChange={(e) => set('firstTime', e.target.checked)} />
            Cliente de primera vez
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.freeTrial} onChange={(e) => set('freeTrial', e.target.checked)} />
            Prueba gratuita
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Recurrencia (Repetir cita)</label>
            <Select value={form.recurrence} onChange={(v) => set('recurrence', v)} options={RECURRENCE_OPTIONS} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Cantidad de Repeticiones</label>
            <Select
              value={form.repeatCount}
              onChange={(v) => set('repeatCount', Number(v))}
              options={REPEAT_COUNTS.map((n) => ({ value: n, label: `${n} veces` }))}
              disabled={form.recurrence === 'none'}
            />
          </div>
        </div>

        {err && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" data-testid="appointment-form-error">{err}</p>}
        {!canManage && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Tienes acceso de solo lectura a esta cita.
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="appointment-form-cancel">
            <X className="h-4 w-4" /> Cancelar
          </Button>
          <Button className="flex-1" onClick={submit} disabled={saving || !canManage} data-testid="appointment-form-save">
            <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
