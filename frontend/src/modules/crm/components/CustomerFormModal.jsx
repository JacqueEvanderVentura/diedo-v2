import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { ACQUISITION_SOURCES, ACQUISITION_SOURCE_LABELS } from '@/data/crm'
import { DOC_TYPES, formatDocumentInput } from '@/modules/agenda/lib/selfBooking'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { cn } from '@/lib/utils'

const emptyCustomerForm = () => ({
  name: '',
  company: '',
  phone: '',
  email: '',
  notes: '',
  customerType: 'b2c',
  acquisitionSource: '',
  docType: 'cedula',
  documentId: '',
  branchIds: [],
})

export function createCustomerFormState(customer = null, defaults = null) {
  if (!customer) {
    const base = emptyCustomerForm()
    if (!defaults) return base
    return {
      ...base,
      name: defaults.name ?? base.name,
      company: defaults.company ?? base.company,
      customerType: defaults.customerType ?? base.customerType,
      branchIds: defaults.branchIds?.length ? [...defaults.branchIds] : base.branchIds,
      phone: defaults.phone ?? base.phone,
      email: defaults.email ?? base.email,
    }
  }
  return {
    ...emptyCustomerForm(),
    name: customer.name || customer.displayName || '',
    company: customer.company || customer.businessName || '',
    phone: customer.phone || '',
    email: customer.email || '',
    notes: customer.notes || '',
    customerType: customer.customerType === 'b2b' ? 'b2b' : 'b2c',
    acquisitionSource: customer.acquisitionSource || '',
    docType: customer.docType || 'cedula',
    documentId: customer.documentId
      ? formatDocumentInput(customer.documentId, customer.docType || 'cedula')
      : '',
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

export function CustomerFormModal({ open, onClose, customer, defaults = null, onCreated }) {
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const updateCustomer = useCustomersStore((s) => s.updateCustomer)
  const branches = useConfigStore((s) => s.branches)
  const [form, setForm] = useState(emptyCustomerForm)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!customer

  useEffect(() => {
    if (!open) return
    setForm(customer ? createCustomerFormState(customer) : createCustomerFormState(null, defaults))
    setErr('')
  }, [open, customer, defaults])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
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
      notes: form.notes.trim() || '',
      customerType: form.customerType,
      acquisitionSource: form.acquisitionSource || null,
      docType: form.documentId.trim() ? form.docType : null,
      documentId: form.documentId.trim() || null,
      branchIds: form.branchIds,
    }
    setSaving(true)
    try {
      if (editing) {
        await updateCustomer(customer.id, payload)
        toast.success(`Cliente "${payload.name}" actualizado`)
      } else {
        const saved = await addCustomer(payload)
        toast.success(`Cliente "${payload.name}" creado`)
        onCreated?.(saved)
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
              onChange={(value) => {
                set('customerType', value)
                if (value === 'b2b' && form.docType === 'cedula') set('docType', 'rnc')
              }}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo de documento</label>
            <Select
              value={form.docType}
              onChange={(value) => set('docType', value)}
              options={
                form.customerType === 'b2b'
                  ? [
                      { value: 'rnc', label: 'RNC' },
                      ...DOC_TYPES.map((item) => ({ value: item.id, label: item.label })),
                    ]
                  : DOC_TYPES.map((item) => ({ value: item.id, label: item.label }))
              }
              data-testid="customer-field-doc-type"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              Documento <span className="text-slate-400">(opcional)</span>
            </label>
            <Input
              value={form.documentId}
              onChange={(e) => set('documentId', formatDocumentInput(e.target.value, form.docType))}
              placeholder={
                form.docType === 'rnc'
                  ? '1-3290890-2'
                  : form.docType === 'cedula'
                    ? '001-1234567-8'
                    : 'Pasaporte'
              }
              data-testid="customer-field-document"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono</label>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="809-000-0000" data-testid="customer-field-phone" />
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
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Origen de captación</label>
          <div className="flex flex-wrap gap-2" data-testid="customer-field-acquisition">
            {ACQUISITION_SOURCES.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => set('acquisitionSource', source)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  form.acquisitionSource === source
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:border-blue-200'
                )}
              >
                {ACQUISITION_SOURCE_LABELS[source]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2">
            <p className="text-sm font-medium text-slate-600">Sucursales asignadas</p>
            <p className="text-xs text-slate-400">El cliente puede comprar en cualquiera de las sucursales seleccionadas.</p>
          </div>
          <BranchMultiSelect
            branches={branches}
            branchIds={form.branchIds}
            onChange={(ids) => {
              setForm((current) => ({ ...current, branchIds: ids }))
              setErr('')
            }}
            showAllOption={false}
            className="w-full"
            testId="customer-field-branches"
          />
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
