import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AttachmentField } from '@/components/ui/AttachmentField'
import { useFinanzasStore, EXPENSE_CATEGORIES } from '@/stores/finanzasStore'
import { useActivosStore } from '@/stores/activosStore'
import { useConfigStore } from '@/stores/configStore'
import { mergeCategoryOptions } from '@/lib/categories'
import { todayKey } from '@/stores/agendaStore'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: 'pagado', label: 'Pagado' },
  { value: 'pendiente', label: 'Pendiente' },
]

const emptyVariable = () => ({
  concept: '',
  amount: '',
  category: 'insumos',
  date: todayKey(),
  branchId: '',
  status: 'pagado',
  budgetId: '',
  activoId: '',
  attachments: [],
})
const emptyFixed = () => ({ concept: '', amount: '', category: 'servicios', branchId: '', dayOfMonth: '1' })

export function ExpenseFormModal({ open, onClose, expense, mode = 'variable' }) {
  const { addExpense, updateExpense, addFixed, updateFixed } = useFinanzasStore()
  const budgets = useFinanzasStore((s) => s.budgets)
  const activos = useActivosStore((s) => s.activos)
  const branches = useConfigStore((s) => s.branches)
  const categories = useConfigStore((s) => s.categories)
  const fixed = mode === 'fixed'
  const [form, setForm] = useState(fixed ? emptyFixed() : emptyVariable())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!expense

  useEffect(() => {
    if (!open) return
    const defaultBranch = branches.find((b) => b.active)?.id || ''
    if (expense) {
      setForm({
        ...(fixed ? emptyFixed() : emptyVariable()),
        branchId: defaultBranch,
        ...expense,
        budgetId: expense.budgetId || '',
        activoId: expense.activoId || '',
        attachments: expense.attachments || [],
        dayOfMonth: String(expense.dayOfMonth || 1),
      })
    } else {
      setForm(fixed ? { ...emptyFixed(), branchId: defaultBranch } : { ...emptyVariable(), branchId: defaultBranch })
    }
    setErr('')
  }, [open, expense, fixed, branches])

  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const activoOptions = [
    { value: '', label: 'Sin activo vinculado' },
    ...activos
      .filter((activo) => activo.status !== 'baja' && (!form.branchId || activo.branchId === form.branchId))
      .map((activo) => ({ value: activo.id, label: `${activo.name} (${activo.code || 'sin código'})` })),
  ]
  const expenseCategoryOptions = useMemo(
    () => mergeCategoryOptions(
      categories,
      EXPENSE_CATEGORIES.map((category) => ({ value: category.id, label: category.name })),
      'gasto'
    ),
    [categories]
  )

  const budgetOptions = useMemo(() => {
    const base = [{ value: '', label: 'Sin presupuesto' }]
    if (!form.branchId) return base
    return [
      ...base,
      ...budgets
        .filter((b) => b.branchId === form.branchId)
        .map((b) => ({ value: b.id, label: `${b.name} (${b.monthlyLimit.toLocaleString('es-DO')} RD$)` })),
    ]
  }, [budgets, form.branchId])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const onBranchChange = (branchId) => {
    setForm((f) => {
      const stillValid = !f.budgetId || budgets.some((b) => b.id === f.budgetId && b.branchId === branchId)
      return { ...f, branchId, budgetId: stillValid ? f.budgetId : '' }
    })
  }

  const submit = async () => {
    if (!form.concept.trim()) return setErr('Ingresa el concepto.')
    if (form.amount === '' || Number(form.amount) <= 0) return setErr('Ingresa un monto válido.')
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    const payload = {
      ...form,
      budgetId: form.budgetId || null,
      activoId: form.category === 'mantenimiento' && form.activoId ? form.activoId : null,
      attachments: form.attachments || [],
    }
    setSaving(true)
    try {
      if (fixed) {
        await (editing ? updateFixed(expense.id, payload) : addFixed(payload))
      } else {
        await (editing ? updateExpense(expense.id, payload) : addExpense(payload))
      }
      toast.success(editing ? 'Gasto actualizado' : 'Gasto registrado')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el gasto.')
    } finally {
      setSaving(false)
    }
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
            <Select value={form.branchId} onChange={onBranchChange} options={branchOptions} data-testid="expense-field-branch" />
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
          {!fixed && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría de presupuesto</label>
              <Select
                value={form.budgetId}
                onChange={(v) => set('budgetId', v)}
                options={budgetOptions}
                placeholder="Vincular a presupuesto"
                data-testid="expense-field-budget"
              />
              <p className="mt-1 text-xs text-slate-400">El monto se restará del disponible del presupuesto seleccionado.</p>
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
            {expenseCategoryOptions.map((c) => (
              <button key={c.value} type="button" onClick={() => set('category', c.value)} data-testid={`expense-cat-${c.value}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.category === c.value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {!fixed && form.category === 'mantenimiento' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Activo vinculado</label>
            <Select
              value={form.activoId}
              onChange={(value) => set('activoId', value)}
              options={activoOptions}
              data-testid="expense-field-activo"
            />
          </div>
        )}

        {!fixed && (
          <AttachmentField
            value={form.attachments}
            onChange={(attachments) => set('attachments', attachments)}
            testId="expense-attachments"
          />
        )}

        {err && <p className="text-sm font-medium text-red-500" data-testid="expense-form-error">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="expense-form-cancel">Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={saving} data-testid="expense-form-save">{saving ? 'Guardando…' : editing ? 'Guardar cambios' : fixed ? 'Crear Gasto Fijo' : 'Enviar Gasto'}</Button>
        </div>
      </div>
    </Modal>
  )
}
