import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useFinanzasStore, EXPENSE_CATEGORIES } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'

const TYPE_OPTIONS = [
  { value: 'prestamo', label: 'Préstamo' },
  { value: 'tarjeta', label: 'Tarjeta de crédito' },
]

const empty = () => ({
  name: '',
  type: 'prestamo',
  initialAmount: '',
  pendingAmount: '',
  branchId: '',
  payDay: '1',
  cutDay: '',
  installment: '',
  paidInstallments: '0',
  totalInstallments: '',
  categoryIds: [],
})

export function PasivoFormModal({ open, onClose, pasivo }) {
  const { addPasivo, updatePasivo } = useFinanzasStore()
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!pasivo

  useEffect(() => {
    if (!open) return
    const { branches } = useConfigStore.getState()
    const defaultBranch = branches.find((b) => b.active)?.id || ''
    if (pasivo) {
      setForm({
        ...empty(),
        ...pasivo,
        initialAmount: String(pasivo.initialAmount),
        pendingAmount: String(pasivo.pendingAmount),
        payDay: String(pasivo.payDay || 1),
        cutDay: pasivo.cutDay ? String(pasivo.cutDay) : '',
        installment: pasivo.installment ? String(pasivo.installment) : '',
        paidInstallments: String(pasivo.paidInstallments || 0),
        totalInstallments: pasivo.totalInstallments ? String(pasivo.totalInstallments) : '',
        categoryIds: pasivo.categoryIds || [],
      })
    } else {
      setForm({ ...empty(), branchId: defaultBranch })
    }
    setErr('')
  }, [open, pasivo])

  const { branches } = useConfigStore.getState()
  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const toggleCat = (id) => {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((c) => c !== id) : [...f.categoryIds, id],
    }))
  }

  const submit = async () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre del pasivo.')
    if (!form.initialAmount || Number(form.initialAmount) <= 0) return setErr('Ingresa un monto inicial válido.')
    const payload = {
      ...form,
      pendingAmount: form.pendingAmount || form.initialAmount,
    }
    setSaving(true)
    try {
      await (editing ? updatePasivo(pasivo.id, payload) : addPasivo(payload))
      toast.success(editing ? 'Pasivo actualizado' : 'Pasivo registrado')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el pasivo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Pasivo' : 'Nuevo Pasivo'} wide testId="pasivo-form-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Préstamo BHD" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo</label>
            <Select value={form.type} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label>
            <Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branchOptions} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto inicial</label>
            <Input type="number" value={form.initialAmount} onChange={(e) => set('initialAmount', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto pendiente</label>
            <Input type="number" value={form.pendingAmount} onChange={(e) => set('pendingAmount', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Día de pago</label>
            <Input type="number" min="1" max="31" value={form.payDay} onChange={(e) => set('payDay', e.target.value)} />
          </div>
          {form.type === 'tarjeta' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Día de corte</label>
              <Input type="number" min="1" max="31" value={form.cutDay} onChange={(e) => set('cutDay', e.target.value)} />
            </div>
          )}
          {form.type === 'prestamo' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-600">Cuota mensual</label>
                <Input type="number" value={form.installment} onChange={(e) => set('installment', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-600">Cuotas pagadas / total</label>
                <div className="flex gap-2">
                  <Input type="number" value={form.paidInstallments} onChange={(e) => set('paidInstallments', e.target.value)} placeholder="Pagadas" />
                  <Input type="number" value={form.totalInstallments} onChange={(e) => set('totalInstallments', e.target.value)} placeholder="Total" />
                </div>
              </div>
            </>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Categorías asociadas</label>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <button key={c.id} type="button" onClick={() => toggleCat(c.id)}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.categoryIds.includes(c.id) ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500')}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear Pasivo'}</Button>
        </div>
      </div>
    </Modal>
  )
}
