import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AttachmentField } from '@/components/ui/AttachmentField'
import { CustomerPicker } from '@/components/customers/CustomerPicker'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { todayKey } from '@/stores/agendaStore'
import { CatalogItemPicker } from './CatalogItemPicker'
import {
  buildManualIncomePayload,
  INCOME_ITEM_KIND_OPTIONS,
  INCOME_PAYMENT_CATEGORY_OPTIONS,
  validateIncomeForm,
} from '../lib/incomeForm'

const POS_CATEGORY_OPTIONS = [
  { value: 'cash', label: 'Efectivo (POS)' },
  { value: 'card', label: 'Tarjeta (POS)' },
  { value: 'transfer', label: 'Transferencia (POS)' },
  { value: 'credit', label: 'Crédito (POS)' },
]

const STATUS_OPTIONS = [
  { value: 'pagado', label: 'Pagado' },
  { value: 'pendiente', label: 'Pendiente' },
]

const SOURCE_OPTIONS = [
  { value: 'Formulario', label: 'Formulario' },
  { value: 'POS', label: 'POS' },
  { value: 'Online', label: 'Online' },
]

const empty = () => ({
  itemKind: 'service',
  catalogItem: null,
  concept: '',
  paymentCategory: 'efectivo',
  branchId: '',
  amount: '',
  date: todayKey(),
  customer: '',
  customerRef: null,
  source: 'Formulario',
  status: 'pagado',
  attachments: [],
})

function customerRefFromIncome(income, customers) {
  const name = (income?.customer || '').trim()
  if (!name) return null
  const match = customers.find((customer) => customer.name?.trim() === name)
  if (match) return match
  return { id: null, name, phone: '' }
}

export function IncomeFormModal({ open, onClose, income }) {
  const addManualIncome = useFinanzasStore((state) => state.addManualIncome)
  const updateIncome = useFinanzasStore((state) => state.updateIncome)
  const customers = useCustomersStore((s) => s.customers)
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!income
  const isPosIncome = income?.origin === 'pos' || (income?.source === 'POS' && !!income?.reference)

  const hydrateCustomers = useCustomersStore((s) => s.hydrate)

  useEffect(() => {
    if (!open) return
    hydrateCustomers().catch(() => {})
    const { branches } = useConfigStore.getState()
    const defaultBranch = branches.find((b) => b.active)?.id || ''
    if (income) {
      setForm({
        ...empty(),
        itemKind: income.itemKind || (income.category === 'servicios' ? 'general' : 'service'),
        catalogItem: income.catalogItemId
          ? { id: income.catalogItemId, name: income.concept || '' }
          : null,
        concept: income.concept || '',
        paymentCategory: income.itemKind && income.itemKind !== 'general'
          ? (income.category || 'efectivo')
          : 'efectivo',
        branchId: income.branchId || defaultBranch,
        amount: String(income.amount),
        date: income.date,
        customer: income.customer || '',
        customerRef: customerRefFromIncome(income, customers),
        source: income.source || 'Formulario',
        status: income.status || 'pagado',
        attachments: income.attachments || [],
        category: income.category,
      })
    } else {
      setForm({ ...empty(), branchId: defaultBranch })
    }
    setErr('')
  }, [open, income, customers, hydrateCustomers])

  const { branches } = useConfigStore.getState()
  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const categoryOptions = useMemo(() => {
    if (!isPosIncome) return []
    return form.category && !POS_CATEGORY_OPTIONS.some((option) => option.value === form.category)
      ? [{ value: form.category, label: `${form.category} (POS)` }, ...POS_CATEGORY_OPTIONS]
      : POS_CATEGORY_OPTIONS
  }, [isPosIncome, form.category])
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    const validation = validateIncomeForm(form)
    if (validation) return setErr(validation)
    setSaving(true)
    try {
      const customerName = form.customerRef?.name?.trim() || form.customer?.trim() || ''
      const payload = buildManualIncomePayload(form, customerName)
      if (isPosIncome) {
        await updateIncome(income.id, {
          ...payload,
          category: form.category,
          source: form.source,
        })
      } else {
        await (editing ? updateIncome(income.id, payload) : addManualIncome(payload))
      }
      toast.success(editing ? 'Ingreso actualizado' : 'Ingreso registrado')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el ingreso.')
    } finally {
      setSaving(false)
    }
  }

  const showCatalogPicker = !isPosIncome && form.itemKind !== 'general'
  const showGeneralConcept = !isPosIncome && form.itemKind === 'general'
  const showPaymentMethod = !isPosIncome && form.itemKind !== 'general'

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar ingreso' : 'Registrar nuevo ingreso'} wide testId="income-form-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!isPosIncome && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo *</label>
              <Select
                value={form.itemKind}
                onChange={(value) => {
                  set('itemKind', value)
                  if (value === 'general') {
                    setForm((current) => ({ ...current, itemKind: value, catalogItem: null }))
                  }
                }}
                options={INCOME_ITEM_KIND_OPTIONS}
              />
            </div>
          )}
          {isPosIncome && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría *</label>
              <Select value={form.category} onChange={(v) => set('category', v)} options={categoryOptions} />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal *</label>
            <Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branchOptions} />
          </div>
          {showCatalogPicker && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Artículo del catálogo *</label>
              <CatalogItemPicker
                itemKind={form.itemKind}
                branchId={form.branchId}
                value={form.catalogItem}
                onChange={(item) => {
                  setForm((current) => ({
                    ...current,
                    catalogItem: item,
                    concept: item?.name || current.concept,
                    amount: item?.price != null && !current.amount ? String(item.price) : current.amount,
                  }))
                }}
              />
            </div>
          )}
          {showGeneralConcept && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Concepto *</label>
              <Input
                value={form.concept}
                onChange={(e) => set('concept', e.target.value)}
                placeholder="Ej. membresía, alquiler de cabina, otro ingreso"
              />
            </div>
          )}
          {showPaymentMethod && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Método de cobro *</label>
              <Select
                value={form.paymentCategory}
                onChange={(v) => set('paymentCategory', v)}
                options={INCOME_PAYMENT_CATEGORY_OPTIONS}
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto *</label>
            <Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha *</label>
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Cliente</label>
            <CustomerPicker
              value={form.customerRef}
              onChange={(customer) => {
                setForm((current) => ({
                  ...current,
                  customerRef: customer,
                  customer: customer?.name || '',
                }))
              }}
              branchId={form.branchId}
              testIdPrefix="income-customer"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Fuente</label>
            <Select value={form.source} onChange={(v) => set('source', v)} options={SOURCE_OPTIONS} disabled={isPosIncome} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Estado</label>
            <Select value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} />
          </div>
        </div>
        {isPosIncome && (
          <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Esta corrección modifica los reportes financieros; la venta original y su inventario permanecen intactos en Caja.
          </p>
        )}
        <AttachmentField
          value={form.attachments}
          onChange={(attachments) => set('attachments', attachments)}
          testId="income-attachments"
        />
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar ingreso'}</Button>
        </div>
      </div>
    </Modal>
  )
}
