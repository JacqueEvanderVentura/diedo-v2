import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAgendaStore, APPOINTMENT_STATUSES, todayKey } from '@/stores/agendaStore'
import { usePosStore } from '@/stores/posStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'

const empty = (date, customerId) => ({
  date: date || todayKey(),
  time: '09:00',
  duration: 30,
  customerId: customerId || 'walk-in',
  serviceId: '',
  status: 'pendiente',
  notes: '',
})

export function AppointmentFormModal({ open, onClose, appointment, defaultDate, defaultCustomerId }) {
  const addAppointment = useAgendaStore((s) => s.addAppointment)
  const updateAppointment = useAgendaStore((s) => s.updateAppointment)
  const customers = usePosStore((s) => s.customers)
  const allProducts = useCatalogStore((s) => s.products)
  const services = useMemo(() => allProducts.filter((p) => p.type === 'service'), [allProducts])

  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const editing = !!appointment

  useEffect(() => {
    if (open) {
      setForm(appointment ? { ...appointment } : empty(defaultDate, defaultCustomerId))
      setErr('')
    }
  }, [open, appointment, defaultDate, defaultCustomerId])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const selectedService = useMemo(() => services.find((s) => s.id === form.serviceId), [services, form.serviceId])

  const submit = () => {
    if (!form.date) return setErr('Selecciona una fecha.')
    if (!form.time) return setErr('Selecciona una hora.')
    const customer = customers.find((c) => c.id === form.customerId)
    const payload = {
      ...form,
      customerName: customer?.name || 'Cliente Mostrador',
      serviceName: selectedService?.name || '',
      price: selectedService?.price || 0,
    }
    if (editing) {
      updateAppointment(appointment.id, payload)
      toast.success('Cita actualizada')
    } else {
      addAppointment(payload)
      toast.success('Cita agendada')
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar cita' : 'Nueva cita'} testId="appointment-form-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha</label>
            <Input type="date" value={form.date} onChange={(e) => { set('date', e.target.value); setErr('') }} data-testid="appointment-field-date" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Hora</label>
            <Input type="time" value={form.time} onChange={(e) => { set('time', e.target.value); setErr('') }} data-testid="appointment-field-time" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Cliente</label>
          <select
            value={form.customerId}
            onChange={(e) => set('customerId', e.target.value)}
            data-testid="appointment-field-customer"
            className="block w-full rounded-xl border-0 bg-white py-3 px-4 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Servicio <span className="text-slate-400">(opcional)</span></label>
          <select
            value={form.serviceId}
            onChange={(e) => set('serviceId', e.target.value)}
            data-testid="appointment-field-service"
            className="block w-full rounded-xl border-0 bg-white py-3 px-4 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          >
            <option value="">Sin servicio</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {formatDOP(s.price)}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Duración (min)</label>
            <Input type="number" value={form.duration} onChange={(e) => set('duration', e.target.value)} placeholder="30" data-testid="appointment-field-duration" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Estado</label>
            <div className="flex flex-wrap gap-1.5">
              {APPOINTMENT_STATUSES.map((st) => (
                <button key={st.id} onClick={() => set('status', st.id)} data-testid={`appointment-status-${st.id}`}
                  className={cn('rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors', form.status === st.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
                  {st.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Notas <span className="text-slate-400">(opcional)</span></label>
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Detalles de la cita" data-testid="appointment-field-notes" />
        </div>

        {err && <p className="text-sm font-medium text-red-500" data-testid="appointment-form-error">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="appointment-form-cancel">Cancelar</Button>
          <Button className="flex-1" onClick={submit} data-testid="appointment-form-save">{editing ? 'Guardar cambios' : 'Agendar cita'}</Button>
        </div>
      </div>
    </Modal>
  )
}
