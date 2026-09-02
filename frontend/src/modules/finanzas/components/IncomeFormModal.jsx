import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { todayKey } from '@/stores/agendaStore'

const CATEGORY_OPTIONS = [
  { value: 'servicios', label: 'Servicios' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencias Bancarias' },
  { value: 'link', label: 'Link de pago' },
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

const empty = () => ({ category: 'servicios', branchId: '', amount: '', date: todayKey(), customer: '', source: 'Formulario', status: 'pagado' })

export function IncomeFormModal({ open, onClose, income }) {
  const { addManualIncome, updateManualIncome } = useFinanzasStore()
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!income

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

  const { branches } = useConfigStore.getState()
  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) return setErr('Ingresa un monto válido.')
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    setSaving(true)
    try {
      await (editing ? updateManualIncome(income.id, form) : addManualIncome(form))
      toast.success(editing ? 'Ingreso actualizado' : 'Ingreso registrado')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el ingreso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar Nuevo Ingreso" wide testId="income-form-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría *</label><Select value={form.category} onChange={(v) => set('category', v)} options={CATEGORY_OPTIONS} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal *</label><Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branchOptions} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Monto *</label><Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha *</label><Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Cliente</label><Input value={form.customer} onChange={(e) => set('customer', e.target.value)} placeholder="Nombre del cliente" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Fuente</label><Select value={form.source} onChange={(v) => set('source', v)} options={SOURCE_OPTIONS} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Estado</label><Select value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} /></div>
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar Ingreso'}</Button>
        </div>
      </div>
    </Modal>
  )
}
