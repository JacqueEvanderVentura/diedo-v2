import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { cn } from '@/lib/utils'

const emptyCustomerForm = () => ({
  name: '',
  company: '',
  phone: '',
  email: '',
  points: '',
  notes: '',
  customerType: 'b2c',
  branchIds: [],
})

export function createCustomerFormState(customer = null) {
  if (!customer) return emptyCustomerForm()
  return {
    ...emptyCustomerForm(),
    name: customer.name || customer.displayName || '',
    company: customer.company || customer.businessName || '',
    phone: customer.phone || '',
    email: customer.email || '',
    points: customer.points ?? '',
    notes: customer.notes || '',
    customerType: customer.customerType === 'b2b' ? 'b2b' : 'b2c',
    branchIds: customer.branchIds?.length
      ? [...customer.branchIds]
      : customer.branchId
        ? [customer.branchId]
        : [],
  }
}

export function toggleCustomerBranch(branchIds, branchId) {
  return branchIds.includes(branchId)
    ? branchIds.filter((id) => id !== branchId)
    : [...branchIds, branchId]
}

export function CustomerFormModal({ open, onClose, customer }) {
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const updateCustomer = useCustomersStore((s) => s.updateCustomer)
  const branches = useConfigStore((s) => s.branches)
  const [form, setForm] = useState(emptyCustomerForm)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!customer

  useEffect(() => {
    if (!open) return
    setForm(createCustomerFormState(customer))
    setErr('')
  }, [open, customer])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const toggleBranch = (branchId) => {
    setForm((current) => ({
      ...current,
      branchIds: toggleCustomerBranch(current.branchIds, branchId),
    }))
    setErr('')
  }

  const submit = async () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre del cliente.')
    if (!form.branchIds.length) return setErr('Selecciona al menos una sucursal.')
    const payload = {
      name: form.name.trim(),
      company: form.customerType === 'b2b'
        ? form.company.trim() || form.name.trim()
        : null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      points: Number(form.points) || 0,
      notes: form.notes.trim() || '',
      customerType: form.customerType,
      branchIds: form.branchIds,
    }
    setSaving(true)
    try {
      if (editing) {
        await updateCustomer(customer.id, payload)
        toast.success(`Cliente "${payload.name}" actualizado`)
      } else {
        await addCustomer(payload)
        toast.success(`Cliente "${payload.name}" creado`)
      }
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar cliente' : 'Nuevo cliente'} wide testId="customer-form-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo de cliente</label>
            <Select
              value={form.customerType}
              onChange={(value) => set('customerType', value)}
              options={[
                { value: 'b2c', label: 'Consumidor (B2C)' },
                { value: 'b2b', label: 'Empresa (B2B)' },
              ]}
              data-testid="customer-field-type"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {form.customerType === 'b2b' ? 'Nombre comercial o contacto' : 'Nombre'}
            </label>
            <Input value={form.name} onChange={(e) => { set('name', e.target.value); setErr('') }} placeholder={form.customerType === 'b2b' ? 'Ej. Grupo Acme' : 'Ej. Juan Pérez'} data-testid="customer-field-name" />
          </div>
        </div>
        {form.customerType === 'b2b' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Razón social <span className="text-slate-400">(opcional)</span></label>
            <Input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Ej. Grupo Acme, S.R.L." data-testid="customer-field-company" />
          </div>
        )}
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

        <div>
          <div className="mb-2">
            <p className="text-sm font-medium text-slate-600">Sucursales asignadas</p>
            <p className="text-xs text-slate-400">El cliente puede comprar en cualquiera de las sucursales seleccionadas.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="customer-field-branches">
            {branches.filter((branch) => branch.active).map((branch) => {
              const checked = form.branchIds.includes(branch.id)
              return (
                <label
                  key={branch.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    checked
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBranch(branch.id)}
                    className="h-4 w-4 rounded border-slate-300"
                    data-testid={`customer-branch-${branch.id}`}
                  />
                  <span className="font-medium">{branch.name}</span>
                </label>
              )
            })}
          </div>
        </div>

        {err && <p className="text-sm font-medium text-red-500" data-testid="customer-form-error">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="customer-form-cancel">Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={saving} data-testid="customer-form-save">
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
