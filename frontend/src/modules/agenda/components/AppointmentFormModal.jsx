import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Save, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { TimePicker } from '@/components/ui/TimePicker'
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
import { canBookResource, canEditResource } from '@/modules/configuracion/lib/agendaCabinas'
import {
  ANY_AVAILABLE_EMPLOYEE_OPTION,
  getAvailableSlots,
  getAvailableSlotsForAny,
  fitsInSchedule,
  isSlotAvailable,
} from '../lib/selfBooking'
import { useAvailabilityAppointments } from '../hooks/useAvailabilityAppointments'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isAppointmentConflict } from '@/services/adapters/appointments'
import { emailResultMessage } from '../lib/notification'
import { APPOINTMENT_NOTES_MAX_LENGTH } from '../lib/appointments'
import { useSessionStore } from '@/stores/sessionStore'
import { servicesForBranch } from '../lib/serviceAvailability'
import {
  APPOINTMENT_RECEIVABLE_PERMISSION_NOTE,
  getAppointmentReceivablePolicy,
} from '../lib/receivablePermissions'
import { buildCompletionPayload } from '../lib/completion'
import {
  SHARED_RESOURCE_CAPACITY,
  appointmentBlocksConfirmedSlot,
  findResourceSharing,
  resourceCapacityMessage,
  resourcePeakOccupancy,
  sharedResourceWarning,
} from '../lib/calendarResourceMove'
import { fetchLastVisitBookingDefaults } from '../lib/customerBookingDefaults'
import {
  appointmentScheduleChanged,
  resolveAppointmentAssignment,
  resolveAppointmentFormResources,
  resolveNextCabinaId,
} from '../lib/appointmentFormResources'

const EMPTY_SLOT = Object.freeze({})

const empty = (date, customerId, slot = {}) => ({
  date: slot.date || date || todayKey(),
  time: 'time' in slot ? slot.time : '08:00',
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
  reminderSent: false,
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
  const canManage = useSessionStore((s) => s.hasPermission('appointment.manage'))
  const canManageReceivables = useSessionStore((s) => s.hasPermission('pos.receivables.manage'))
  const sessionStatus = useSessionStore((s) => s.status)
  const catalogHydrated = useCatalogStore((s) => s.apiContext.hydrated)

  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const appointments = useAvailabilityAppointments(form.date, form.employeeId, form.branchId)
  const editing = !!appointment
  const notesLength = Array.from(form.notes || '').length
  const originalNotes = appointment?.notes || ''
  const notesChanged = !editing || form.notes !== originalNotes
  const notesTooLong = notesLength > APPOINTMENT_NOTES_MAX_LENGTH
  const legacyNotes = editing && notesTooLong && !notesChanged
  const servicesReady = sessionStatus === 'online' && catalogHydrated
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
    : APPOINTMENT_STATUSES.filter((status) => status.id === 'confirmada')
  const price = selectedService?.price || form.price || 0
  const anyAvailableEmployee = !form.employeeId
  const cabinaAccess = useMemo(
    () => resources.find((resource) => resource.id === form.cabinaId)?.access,
    [form.cabinaId, resources],
  )
  const hasBookableCabina = useMemo(() => {
    const scoped = resources.filter(
      (resource) => resource.branchId === form.branchId && resource.active !== false,
    )
    return scoped.some((resource) => canBookResource(resource.access))
  }, [form.branchId, resources])
  const canSaveAppointment = canManage && (appointment
    ? !form.cabinaId || canEditResource(cabinaAccess)
    : (anyAvailableEmployee ? hasBookableCabina : canBookResource(cabinaAccess)))
  const branchStaff = useBranchStaff(form.branchId)
  const assignedCabinaId = appointment?.branchId === form.branchId ? appointment?.cabinaId || '' : ''
  const branchResources = useMemo(
    () =>
      resolveAppointmentFormResources({
        resources,
        branchId: form.branchId,
        currentCabinaId: assignedCabinaId,
      }),
    [assignedCabinaId, form.branchId, resources],
  )
  const employeeOptions = useMemo(() => {
    const assignedId = appointment?.employeeId
    if (!assignedId || branchStaff.some((member) => member.id === assignedId)) return branchStaff
    const assigned = employees.find((member) => member.id === assignedId)
    return [{ id: assignedId, name: assigned?.name || 'Empleado asignado' }, ...branchStaff]
  }, [appointment?.employeeId, branchStaff, employees])
  const resourcesLoading = resourceLoadingByBranch[form.branchId] === true
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === form.employeeId),
    [employees, form.employeeId]
  )

  const availableSlots = useMemo(() => {
    if (!form.date) return []
    if (form.employeeId) {
      return getAvailableSlots({
        date: form.date,
        employeeId: form.employeeId,
        duration: form.duration,
        appointments,
        employee: selectedEmployee,
        vacationRequests,
        excludeAppointmentId: appointment?.id,
      })
    }
    return getAvailableSlotsForAny({
      date: form.date,
      duration: form.duration,
      appointments,
      employees: branchStaff,
      resources: branchResources,
      vacationRequests,
      excludeAppointmentId: appointment?.id,
    })
  }, [
    form.employeeId,
    form.date,
    form.duration,
    appointments,
    selectedEmployee,
    vacationRequests,
    appointment?.id,
    branchStaff,
    branchResources,
  ])

  useEffect(() => {
    if (!form.employeeId) return
    if (!employeeOptions.some((e) => e.id === form.employeeId)) {
      setForm((f) => ({ ...f, employeeId: '' }))
    }
  }, [form.branchId, employeeOptions, form.employeeId])

  useEffect(() => {
    if (!open || !form.branchId) return
    hydrateResources({ branchId: form.branchId }).catch(() => {})
  }, [form.branchId, hydrateResources, open])

  useEffect(() => {
    if (!open || !form.branchId || resourcesLoading) return
    const nextCabinaId = resolveNextCabinaId({
      isEditing: editing,
      employeeSelected: Boolean(form.employeeId),
      formCabinaId: form.cabinaId || '',
      options: branchResources,
    })
    if (nextCabinaId === (form.cabinaId || '')) return
    setForm((current) => ({
      ...current,
      cabinaId: nextCabinaId,
      resourceId: nextCabinaId,
    }))
  }, [branchResources, editing, form.branchId, form.cabinaId, form.employeeId, open, resourcesLoading])

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
    if (editing) return
    fetchLastVisitBookingDefaults(c.id)
      .then(({ serviceId, employeeId }) => {
        setForm((current) => {
          const next = { ...current }
          if (serviceId && services.some((service) => service.id === serviceId)) {
            const selected = services.find((service) => service.id === serviceId)
            next.serviceId = serviceId
            next.serviceName = selected?.name || ''
            next.price = selected?.price ?? 0
            next.duration = Number(selected?.durationMinutes) || 30
          }
          if (employeeId && branchStaff.some((member) => member.id === employeeId)) {
            next.employeeId = employeeId
          }
          return next
        })
      })
      .catch(() => {})
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
    const assignment = resolveAppointmentAssignment({
      isEditing: editing,
      employeeId: form.employeeId,
      cabinaId: form.cabinaId,
    })
    return {
      ...form,
      customerName: form.customerName || customer?.name || 'Cliente',
      customerPhone: form.customerPhone || customer?.phone || '',
      serviceName: selectedService?.name || form.serviceName || '',
      price,
      ...assignment,
      resourceId: assignment.cabinaId,
    }
  }

  const submit = async () => {
    if (saving) return
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    if (!editing && !resourcesLoading && branchResources.length === 0) {
      return setErr('La sucursal seleccionada no tiene cabinas o recursos activos.')
    }
    if (!editing && form.employeeId && !form.cabinaId) return setErr('Selecciona una cabina o recurso.')
    if (!selectedService) return setErr('Selecciona un servicio disponible en esa sucursal.')
    if (!form.date) return setErr('Selecciona una fecha.')
    if (!form.time) return setErr('Selecciona una hora.')
    if (notesTooLong && notesChanged) {
      return setErr(`Las notas admiten un máximo de ${APPOINTMENT_NOTES_MAX_LENGTH} caracteres.`)
    }
    const scheduleChanged = appointmentScheduleChanged(appointment, form)
    if (
      scheduleChanged &&
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
    if (scheduleChanged && !availableSlots.includes(form.time)) {
      return setErr(
        form.employeeId
          ? 'Ese horario ya no está disponible para el empleado.'
          : 'Ese horario ya no está disponible para ningún empleado.'
      )
    }
    let payload = buildPayload()
    if (payload.status === 'cumplida' && !payload.completionPunctuality) {
      payload = { ...payload, ...buildCompletionPayload({ punctuality: 'on_time' }) }
    }
    const occupancyQuery = payload.cabinaId && appointmentBlocksConfirmedSlot(payload)
      ? {
        appointments,
        resourceId: payload.cabinaId,
        date: payload.date,
        time: payload.time,
        duration: payload.duration,
        excludeId: appointment?.id ?? null,
      }
      : null
    const cabinaName = branchResources.find((resource) => resource.id === payload.cabinaId)?.name
    if (occupancyQuery && resourcePeakOccupancy(occupancyQuery) > SHARED_RESOURCE_CAPACITY) {
      return setErr(resourceCapacityMessage(cabinaName))
    }
    const sharedWith = occupancyQuery ? findResourceSharing(occupancyQuery) : null
    const sharedWarning = sharedWith
      ? sharedResourceWarning({ resourceName: cabinaName, occupant: sharedWith })
      : ''
    setSaving(true)
    setErr('')
    try {
      if (editing) {
        const updated = await updateAppointment(appointment.id, payload)
        toast.success(`Cita actualizada. ${emailResultMessage(updated.notification)}`)
      } else {
        const created = await addAppointment(payload)
        const count = Array.isArray(created) ? created.length : 1
        const first = Array.isArray(created) ? created[0] : created
        toast.success(
          `${count > 1 ? `${count} citas agendadas` : 'Cita agendada'}. ${emailResultMessage(first?.notification)}`
        )
      }
      if (sharedWarning) toast.warning(sharedWarning)
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
      createdAt: appointment?.createdAt,
      updatedAt: appointment?.updatedAt,
    }),
    [form, customers, selectedService, price, appointment]
  )

  const timeSlotsForPicker = form.date ? availableSlots : null

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar cita' : 'Nueva Cita'} testId="appointment-form-modal" wide={wide}>
      <div className="space-y-4">
        {editing && (
          <div className="flex flex-col items-center gap-3">
            <AppointmentShareCard appointment={previewAppointment} showAudit />
            <AppointmentShareActions appointment={previewAppointment} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600">Cliente</label>
            <CustomerPicker
              value={selectedCustomer}
              onChange={pickCustomer}
              branchId={form.branchId}
              testIdPrefix="appointment-customer"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha</label>
            <DatePicker
              value={form.date}
              onChange={(date) => set('date', date)}
              testId="appointment-field-date"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Hora</label>
            <TimePicker
              value={form.time}
              onChange={(time) => set('time', time)}
              slots={timeSlotsForPicker}
              emptyMessage={
                form.employeeId
                  ? 'No hay cupos según el horario del empleado.'
                  : 'No hay cupos disponibles con el personal de la sucursal.'
              }
              testId="appointment-field-time"
            />
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Servicio</label>
            <Select
              value={form.serviceId}
              onChange={(v) => {
                const next = services.find((service) => service.id === v)
                setForm((current) => {
                  const nextDuration = Number(next?.durationMinutes) || 30
                  let nextTime = current.time
                  if (current.time && current.employeeId && current.date) {
                    const slots = getAvailableSlots({
                      date: current.date,
                      employeeId: current.employeeId,
                      duration: nextDuration,
                      appointments,
                      employee: employees.find((e) => e.id === current.employeeId),
                      vacationRequests,
                      excludeAppointmentId: appointment?.id,
                    })
                    if (!slots.includes(current.time)) nextTime = ''
                  }
                  return {
                    ...current,
                    serviceId: v,
                    serviceName: next?.name || '',
                    price: next?.price ?? 0,
                    duration: nextDuration,
                    time: nextTime,
                  }
                })
                setErr('')
              }}
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
              onChange={(v) => {
                if (!v && editing) {
                  set('employeeId', '')
                  return
                }
                if (!v) {
                  setForm((current) => {
                    const slots = getAvailableSlotsForAny({
                      date: current.date,
                      duration: current.duration,
                      appointments,
                      employees: branchStaff,
                      resources: branchResources,
                      vacationRequests,
                      excludeAppointmentId: appointment?.id,
                    })
                    const next = {
                      ...current,
                      employeeId: '',
                      cabinaId: '',
                      resourceId: '',
                    }
                    if (current.time && current.date && !slots.includes(current.time)) {
                      next.time = ''
                    }
                    return next
                  })
                  return
                }
                set('employeeId', v)
              }}
              placeholder="Seleccionar Empleado"
              options={[
                ANY_AVAILABLE_EMPLOYEE_OPTION,
                ...employeeOptions.map((e) => ({ value: e.id, label: e.name })),
              ]}
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
              value={editing || form.employeeId ? form.cabinaId : ''}
              onChange={(v) => setForm((current) => ({ ...current, cabinaId: v, resourceId: v }))}
              placeholder={editing || form.employeeId ? 'Seleccionar Cabina' : 'Sin asignar'}
              disabled={!editing && !form.employeeId}
              options={branchResources.map((resource) => ({ value: resource.id, label: resource.name }))}
              data-testid="appointment-field-cabina"
            />
            {!resourcesLoading && form.branchId && branchResources.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600" data-testid="appointment-no-resources">
                Esta sucursal no tiene cabinas o recursos activos.
              </p>
            )}
          </div>
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
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="block text-sm font-medium text-slate-600">Notas</label>
            <span
              className={cn(
                'text-xs tabular-nums',
                notesTooLong ? 'font-semibold text-amber-600' : 'text-slate-400'
              )}
              data-testid="appointment-notes-count"
            >
              {notesLength}/{APPOINTMENT_NOTES_MAX_LENGTH}
            </span>
          </div>
          <Input
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            maxLength={legacyNotes ? undefined : APPOINTMENT_NOTES_MAX_LENGTH}
            aria-describedby={notesTooLong ? 'appointment-notes-help' : undefined}
            placeholder="Notas adicionales"
            data-testid="appointment-field-notes"
          />
          {legacyNotes && (
            <p id="appointment-notes-help" className="mt-1.5 text-xs text-amber-600">
              Esta nota histórica se conservará. Para modificarla, redúcela a 60 caracteres o menos.
            </p>
          )}
          {notesTooLong && notesChanged && (
            <p id="appointment-notes-help" className="mt-1.5 text-xs font-medium text-red-600">
              Reduce la nota a 60 caracteres o menos antes de guardar.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Estatus</label>
            <Select
              value={form.status}
              onChange={(value) => {
                setForm((current) => ({
                  ...current,
                  status: value,
                  completed: value === 'cumplida',
                }))
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
          <Button className="flex-1" onClick={submit} disabled={saving || !canSaveAppointment} data-testid="appointment-form-save">
            <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
