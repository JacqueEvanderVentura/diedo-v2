import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useFinanzasStore, EXPENSE_CATEGORIES } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { todayKey } from '@/stores/agendaStore'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: 'pagado', label: 'Pagado' },
  { value: 'pendiente', label: 'Pendiente' },
]

const emptyVariable = () => ({ concept: '', amount: '', category: 'insumos', date: todayKey(), branchId: '', status: 'pagado', budgetId: '' })
const emptyFixed = () => ({ concept: '', amount: '', category: 'servicios', branchId: '', dayOfMonth: '1' })

export function ExpenseFormModal({ open, onClose, expense, mode = 'variable' }) {
  const { addExpense, updateExpense, addFixed, updateFixed } = useFinanzasStore()
  const fixed = mode === 'fixed'
  const [form, setForm] = useState(fixed ? emptyFixed() : emptyVariable())
  const [err, setErr] = useState('')
  const editing = !!expense

  useEffect(() => {
    if (!open) return
    const { branches } = useConfigStore.getState()
    const defaultBranch = branches.find((b) => b.active)?.id || ''
    if (expense) {
      setForm({ ...(fixed ? emptyFixed() : emptyVariable()), branchId: defaultBranch, ...expense, dayOfMonth: String(expense.dayOfMonth || 1) })
    } else {
      setForm(fixed ? { ...emptyFixed(), branchId: defaultBranch } : { ...emptyVariable(), branchId: defaultBranch })
    }
    setErr('')
  }, [open, expense, fixed])

  const { branches } = useConfigStore.getState()
  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.concept.trim()) return setErr('Ingresa el concepto.')
    if (form.amount === '' || Number(form.amount) <= 0) return setErr('Ingresa un monto válido.')
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    if (fixed) {
      editing ? updateFixed(expense.id, form) : addFixed(form)
    } else {
      editing ? updateExpense(expense.id, form) : addExpense(form)
    }
    toast.success(editing ? 'Gasto actualizado' : 'Gasto registrado')
    onClose()
  }

  const title = editing ? (fixed ? 'Editar gasto fijo' : 'Editar gasto') : fixed ? 'Nuevo Gasto Fijo' : 'Registrar Nuevo Gasto'

  return (
    <Modal open={open} onClose={onClose} title={title} testId="expense-form-modal" wide={!fixed}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{fixed ? 'Nombre del Gasto' : 'Descripción'}</label>
          <Input value={form.concept} onChange={(e) => { set('concept', e.target.value); setErr('') }} placeholder={fixed ? 'Ej. Alquiler, Internet...' : 'Detalles del gasto...'} data-testid="expense-field-concept" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label>
            <Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branchOptions} data-testid="expense-field-branch" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto (RD$)</label>
            <Input type="number" value={form.amount} onChange={(e) => { set('amount', e.target.value); setErr('') }} placeholder="0.00" data-testid="expense-field-amount" />
          </div>
          {!fixed && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha</label>
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} data-testid="expense-field-date" />
            </div>
          )}
          {!fixed && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Estado</label>
              <Select value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} data-testid="expense-field-status" />
            </div>
          )}
          {fixed && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Día del Mes (Pago)</label>
              <Input type="number" min="1" max="31" value={form.dayOfMonth} onChange={(e) => set('dayOfMonth', e.target.value)} data-testid="expense-field-day" />
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría</label>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <button key={c.id} type="button" onClick={() => set('category', c.id)} data-testid={`expense-cat-${c.id}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.category === c.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-sm font-medium text-red-500" data-testid="expense-form-error">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="expense-form-cancel">Cancelar</Button>
          <Button className="flex-1" onClick={submit} data-testid="expense-form-save">{editing ? 'Guardar cambios' : fixed ? 'Crear Gasto Fijo' : 'Enviar Gasto'}</Button>
        </div>
      </div>
    </Modal>
  )
}
