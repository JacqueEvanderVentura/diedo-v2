import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AttachmentField } from '@/components/ui/AttachmentField'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { mergeCategoryOptions } from '@/lib/categories'
import { todayKey } from '@/stores/agendaStore'

const MANUAL_CATEGORY_OPTIONS = [
  { value: 'servicios', label: 'Servicios' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencias Bancarias' },
  { value: 'link', label: 'Link de pago' },
]

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
  category: 'servicios',
  branchId: '',
  amount: '',
  date: todayKey(),
  customer: '',
  source: 'Formulario',
  status: 'pagado',
  attachments: [],
})

export function IncomeFormModal({ open, onClose, income }) {
  const addManualIncome = useFinanzasStore((state) => state.addManualIncome)
  const updateIncome = useFinanzasStore((state) => state.updateIncome)
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!income
  const isPosIncome = income?.origin === 'pos' || (income?.source === 'POS' && !!income?.reference)

  useEffect(() => {
    if (!open) return
    const { branches } = useConfigStore.getState()
    const defaultBranch = branches.find((b) => b.active)?.id || ''
    if (income) {
      setForm({ ...empty(), ...income, amount: String(income.amount) })
    } else {
      setForm({ ...empty(), branchId: defaultBranch })
    }
    setErr('')
  }, [open, income])

  const categories = useConfigStore((s) => s.categories)
  const { branches } = useConfigStore.getState()
  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const baseCategoryOptions = useMemo(() => {
    const manual = mergeCategoryOptions(categories, MANUAL_CATEGORY_OPTIONS, 'ingreso')
    return isPosIncome ? [...manual, ...POS_CATEGORY_OPTIONS] : manual
  }, [categories, isPosIncome])
  const categoryOptions = form.category && !baseCategoryOptions.some((option) => option.value === form.category)
    ? [{ value: form.category, label: `${form.category} (POS)` }, ...baseCategoryOptions]
    : baseCategoryOptions
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) return setErr('Ingresa un monto válido.')
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    setSaving(true)
    try {
      await (editing ? updateIncome(income.id, form) : addManualIncome(form))
      toast.success(editing ? 'Ingreso actualizado' : 'Ingreso registrado')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el ingreso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar ingreso' : 'Registrar nuevo ingreso'} wide testId="income-form-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría *</label><Select value={form.category} onChange={(v) => set('category', v)} options={categoryOptions} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal *</label><Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branchOptions} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Monto *</label><Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha *</label><Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Cliente</label><Input value={form.customer} onChange={(e) => set('customer', e.target.value)} placeholder="Nombre del cliente" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Fuente</label><Select value={form.source} onChange={(v) => set('source', v)} options={SOURCE_OPTIONS} disabled={isPosIncome} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Estado</label><Select value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} /></div>
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
