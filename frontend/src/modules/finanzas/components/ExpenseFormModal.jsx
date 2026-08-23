import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useFinanzasStore, EXPENSE_CATEGORIES } from '@/stores/finanzasStore'
import { todayKey } from '@/stores/agendaStore'
import { cn } from '@/lib/utils'

const emptyVariable = () => ({ concept: '', amount: '', category: 'insumos', date: todayKey() })
const emptyFixed = () => ({ concept: '', amount: '', category: 'servicios' })

export function ExpenseFormModal({ open, onClose, expense, mode = 'variable' }) {
  const { addExpense, updateExpense, addFixed, updateFixed } = useFinanzasStore()
  const fixed = mode === 'fixed'
  const [form, setForm] = useState(fixed ? emptyFixed() : emptyVariable())
  const [err, setErr] = useState('')
  const editing = !!expense

  useEffect(() => {
    if (open) {
      setForm(expense ? { ...(fixed ? emptyFixed() : emptyVariable()), ...expense } : fixed ? emptyFixed() : emptyVariable())
      setErr('')
    }
  }, [open, expense, fixed])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.concept.trim()) return setErr('Ingresa el concepto.')
    if (form.amount === '' || Number(form.amount) <= 0) return setErr('Ingresa un monto válido.')
    if (fixed) {
      editing ? updateFixed(expense.id, form) : addFixed(form)
    } else {
      editing ? updateExpense(expense.id, form) : addExpense(form)
    }
    toast.success(editing ? 'Gasto actualizado' : 'Gasto registrado')
    onClose()
  }

  const title = editing ? (fixed ? 'Editar gasto fijo' : 'Editar gasto') : fixed ? 'Nuevo gasto fijo' : 'Nuevo gasto'

  return (
    <Modal open={open} onClose={onClose} title={title} testId="expense-form-modal">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Concepto</label>
          <Input value={form.concept} onChange={(e) => { set('concept', e.target.value); setErr('') }} placeholder="Ej. Compra de insumos" data-testid="expense-field-concept" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto (DOP$)</label>
            <Input type="number" value={form.amount} onChange={(e) => { set('amount', e.target.value); setErr('') }} placeholder="0.00" data-testid="expense-field-amount" />
          </div>
          {!fixed && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha</label>
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} data-testid="expense-field-date" />
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría</label>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => set('category', c.id)} data-testid={`expense-cat-${c.id}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.category === c.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-sm font-medium text-red-500" data-testid="expense-form-error">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="expense-form-cancel">Cancelar</Button>
          <Button className="flex-1" onClick={submit} data-testid="expense-form-save">{editing ? 'Guardar cambios' : 'Registrar'}</Button>
        </div>
      </div>
    </Modal>
  )
}
