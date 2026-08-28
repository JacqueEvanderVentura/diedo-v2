import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Save, X, MessageSquare } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useAgendaStore, todayKey } from '@/stores/agendaStore'
import { usePosStore } from '@/stores/posStore'
import { useCatalogStore } from '@/stores/catalogStore'
import {
  CABINAS,
  EMPLOYEES,
  DURATION_OPTIONS,
  RECURRENCE_OPTIONS,
  REPEAT_COUNTS,
  CALENDAR_STATUSES,
  employeeName,
} from '@/data/agenda'
import { formatDOP } from '@/lib/format'
import { endTime, formatShortDate, addDaysKey, addMonthsKey } from '../lib/calendar'
import { cn } from '@/lib/utils'

const empty = (date, customerId, slot = {}) => ({
  date: slot.date || date || todayKey(),
  time: slot.time || '08:00',
  duration: 30,
  customerId: customerId || 'walk-in',
  customerName: '',
  customerPhone: '',
  serviceId: '',
  employeeId: slot.employeeId || '',
  cabinaId: slot.cabinaId || 'cab1',
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

export function AppointmentFormModal({ open, onClose, appointment, defaultDate, defaultCustomerId, defaultSlot = {}, wide }) {
  const addAppointment = useAgendaStore((s) => s.addAppointment)
  const addAppointments = useAgendaStore((s) => s.addAppointments)
  const updateAppointment = useAgendaStore((s) => s.updateAppointment)
  const customers = usePosStore((s) => s.customers)
  const allProducts = useCatalogStore((s) => s.products)
  const services = useMemo(() => allProducts.filter((p) => p.type === 'service'), [allProducts])

  const [form, setForm] = useState(empty())
  const [search, setSearch] = useState('')
  const [err, setErr] = useState('')
  const editing = !!appointment

  useEffect(() => {
    if (open) {
      setForm(appointment ? { ...appointment } : empty(defaultDate, defaultCustomerId, defaultSlot))
      setSearch('')
      setErr('')
    }
  }, [open, appointment, defaultDate, defaultCustomerId, defaultSlot])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const selectedService = useMemo(() => services.find((s) => s.id === form.serviceId), [services, form.serviceId])
  const price = selectedService?.price || form.price || 0

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers.filter((c) => !c.isDefault)
    return customers.filter(
      (c) => !c.isDefault && (c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)))
    )
  }, [customers, search])

  const pickCustomer = (c) => {
    setForm((f) => ({
      ...f,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone || '',
    }))
    setSearch('')
  }

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

  const buildSeries = (payload) => {
    const count = payload.recurrence === 'none' ? 1 : Number(payload.repeatCount) || 2
    const list = []
    for (let i = 0; i < count; i++) {
      const date =
        payload.recurrence === 'weekly'
          ? addDaysKey(payload.date, i * 7)
          : payload.recurrence === 'monthly'
            ? addMonthsKey(payload.date, i)
            : payload.date
      list.push({ ...payload, date })
    }
    return list
  }

  const submit = () => {
    if (!form.date) return setErr('Selecciona una fecha.')
    if (!form.time) return setErr('Selecciona una hora.')
    const payload = buildPayload()
    if (editing) {
      updateAppointment(appointment.id, payload)
      toast.success('Cita actualizada')
    } else {
      const series = buildSeries(payload)
      if (series.length > 1) addAppointments(series)
      else addAppointment(payload)
      toast.success(series.length > 1 ? `${series.length} citas agendadas` : 'Cita agendada')
    }
    onClose()
  }

  const previewName = form.customerName || customers.find((c) => c.id === form.customerId)?.name || 'Cliente'

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar cita' : 'Nueva Cita'} testId="appointment-form-modal" wide={wide}>
      <div className="space-y-4">
        {/* Preview card */}
        <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-4 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                {previewName.slice(0, 1).toUpperCase()}
              </div>
              <div className="font-semibold text-slate-800">{previewName}</div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">📅</div>
          </div>
          <div className="my-3 border-t border-slate-100" />
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{formatShortDate(form.date)}</span>
            <span className="font-semibold text-slate-800">{form.time} - {endTime(form.time, form.duration)}</span>
          </div>
          <div className="mt-4 flex items-start justify-between">
            <div>
              <div className="font-semibold text-slate-800">{selectedService?.name || 'Servicio'}</div>
              <div className="text-sm text-slate-400">{employeeName(form.employeeId) || 'Con Especialista'}</div>
            </div>
            <div className="text-sm font-semibold text-slate-800">{formatDOP(price)}</div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <MessageSquare className="h-4 w-4" />
              <span className="font-medium">Recordatorio</span>
            </div>
            <span className="font-semibold uppercase text-emerald-600">{form.reminderSent ? 'Entregado' : 'Pendiente'}</span>
          </div>
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
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Empleado</label>
            <Select
              value={form.employeeId}
              onChange={(v) => set('employeeId', v)}
              placeholder="Seleccionar Empleado"
              options={EMPLOYEES.map((e) => ({ value: e.id, label: e.name }))}
              data-testid="appointment-field-employee"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Cabina</label>
            <Select
              value={form.cabinaId}
              onChange={(v) => set('cabinaId', v)}
              placeholder="Seleccionar Cabina"
              options={CABINAS.map((c) => ({ value: c.id, label: c.name }))}
              data-testid="appointment-field-cabina"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha</label>
            <Input type="date" value={form.date} onChange={(e) => { set('date', e.target.value); setErr('') }} data-testid="appointment-field-date" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Hora</label>
            <Input type="time" value={form.time} onChange={(e) => { set('time', e.target.value); setErr('') }} data-testid="appointment-field-time" />
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente por nombre o teléfono..."
            data-testid="appointment-field-search"
          />
          {search && filteredCustomers.length > 0 && (
            <ul className="max-h-32 overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-sm">
              {filteredCustomers.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => pickCustomer(c)} className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                    {c.name} {c.phone && <span className="ml-2 text-slate-400">{c.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
              onChange={(v) => set('status', v)}
              options={CALENDAR_STATUSES.map((s) => ({ value: s.id, label: s.name }))}
              data-testid="appointment-field-status"
            />
          </div>
          <label className="flex items-center gap-2 pt-8 text-sm font-medium text-slate-600">
            <input type="checkbox" checked={form.completed} onChange={(e) => set('completed', e.target.checked)} data-testid="appointment-field-completed" />
            Completada
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.pendingPayment} onChange={(e) => set('pendingPayment', e.target.checked)} data-testid="appointment-field-pending" />
            Pendiente de pago
          </label>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto pendiente</label>
            <Input type="number" min="0" disabled={!form.pendingPayment} value={form.pendingAmount || ''} onChange={(e) => set('pendingAmount', e.target.value)} data-testid="appointment-field-pending-amount" />
          </div>
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

        {err && <p className="text-sm font-medium text-red-500" data-testid="appointment-form-error">{err}</p>}

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="appointment-form-cancel">
            <X className="h-4 w-4" /> Cancelar
          </Button>
          <Button className="flex-1" onClick={submit} data-testid="appointment-form-save">
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
