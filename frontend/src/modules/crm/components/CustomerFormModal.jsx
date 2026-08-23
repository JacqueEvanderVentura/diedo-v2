import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePosStore } from '@/stores/posStore'

const genId = () => `cust-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const EMPTY = { name: '', phone: '', email: '', points: '', notes: '' }

export function CustomerFormModal({ open, onClose, customer }) {
  const addCustomer = usePosStore((s) => s.addCustomer)
  const updateCustomer = usePosStore((s) => s.updateCustomer)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const editing = !!customer

  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? { name: customer.name, phone: customer.phone || '', email: customer.email || '', points: customer.points ?? '', notes: customer.notes || '' }
          : EMPTY
      )
      setErr('')
    }
  }, [open, customer])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre del cliente.')
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      points: Number(form.points) || 0,
      notes: form.notes.trim() || '',
    }
    if (editing) {
      updateCustomer(customer.id, payload)
      toast.success(`Cliente "${payload.name}" actualizado`)
    } else {
      addCustomer({ id: genId(), ...payload })
      toast.success(`Cliente "${payload.name}" creado`)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar cliente' : 'Nuevo cliente'} testId="customer-form-modal">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
          <Input value={form.name} onChange={(e) => { set('name', e.target.value); setErr('') }} placeholder="Ej. Juan Pérez" data-testid="customer-field-name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono</label>
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="809-000-0000" data-testid="customer-field-phone" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Puntos</label>
            <Input type="number" value={form.points} onChange={(e) => set('points', e.target.value)} placeholder="0" data-testid="customer-field-points" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Email <span className="text-slate-400">(opcional)</span></label>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="cliente@correo.com" data-testid="customer-field-email" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Notas <span className="text-slate-400">(opcional)</span></label>
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Preferencias, observaciones..." data-testid="customer-field-notes" />
        </div>

        {err && <p className="text-sm font-medium text-red-500" data-testid="customer-form-error">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="customer-form-cancel">Cancelar</Button>
          <Button className="flex-1" onClick={submit} data-testid="customer-form-save">{editing ? 'Guardar cambios' : 'Crear cliente'}</Button>
        </div>
      </div>
    </Modal>
  )
}
