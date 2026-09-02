import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { fmtWhen, isThisMonth, budgetUsagePct, formatBudgetPct, budgetSpentForMonth } from '../lib/finanzas'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { BUDGET_GROUPS } from '@/stores/finanzasStore'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { cn } from '@/lib/utils'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'

function BudgetTransactionsTable({ transactions }) {
  const { rows, sortKey, sortDir, toggleSort } = useSortedRows(transactions, {
    defaultSort: { key: 'date', dir: 'desc' },
    accessors: {
      concept: (t) => t.concept || '',
      date: (t) => new Date(t.date),
      amount: (t) => t.amount || 0,
    },
  })

  return (
    <ResponsiveList columnCount={3}>
      <ResponsiveTable wrapCard={false}>
        <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <SortableTh column="concept" className="py-2">Transacción</SortableTh>
                <SortableTh column="date" className="py-2">Fecha</SortableTh>
                <SortableTh column="amount" align="right" className="py-2">Monto</SortableTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-slate-50">
                  <td className="py-2 font-medium text-slate-700">{t.concept}</td>
                  <td className="py-2 text-slate-400">{fmtWhen(t.date)}</td>
                  <td className="py-2 text-right text-red-500">{formatDOP(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SortableTableProvider>
      </ResponsiveTable>
      <ResponsiveCards className="mt-3">
        {rows.map((t) => (
          <MobileCard key={t.id}>
            <MobileCardGrid>
              <MobileField label="Transacción" fullWidth>{t.concept}</MobileField>
              <MobileField label="Fecha">{fmtWhen(t.date)}</MobileField>
              <MobileField label="Monto"><span className="font-semibold text-red-500">{formatDOP(t.amount)}</span></MobileField>
            </MobileCardGrid>
          </MobileCard>
        ))}
      </ResponsiveCards>
    </ResponsiveList>
  )
}

export default function PresupuestosPage() {
  const budgets = useFinanzasStore((s) => s.budgets)
  const expenses = useFinanzasStore((s) => s.expenses)
  const addBudget = useFinanzasStore((s) => s.addBudget)
  const getBudgetStats = useFinanzasStore((s) => s.getBudgetStats)
  const branches = useConfigStore((s) => s.branches)

  const [branchFilter, setBranchFilter] = useState('charm-dn')
  const [groupFilter, setGroupFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', group: 'operaciones', monthlyLimit: '', branchId: 'charm-dn' })

  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const groupOptions = [{ value: 'all', label: 'Todas las Categorías' }, ...BUDGET_GROUPS.map((g) => ({ value: g.id, label: g.name }))]

  const stats = useMemo(() => getBudgetStats(branchFilter), [budgets, expenses, branchFilter, getBudgetStats])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return budgets
      .filter((b) => b.branchId === branchFilter)
      .filter((b) => groupFilter === 'all' || b.group === groupFilter)
      .filter((b) => !q || b.name.toLowerCase().includes(q))
  }, [budgets, branchFilter, groupFilter, query])

  useEffect(() => {
    if (branchOptions.length && !branchOptions.some((option) => option.value === branchFilter)) {
      const branchId = branchOptions[0].value
      setBranchFilter(branchId)
      setForm((current) => ({ ...current, branchId }))
    }
  }, [branchFilter, branchOptions])

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Ingresa el nombre')
    if (!form.monthlyLimit || Number(form.monthlyLimit) <= 0) return toast.error('Ingresa una meta mensual válida')
    try {
      await addBudget({ ...form, branchId: branchFilter })
      toast.success('Categoría de presupuesto creada')
      setModalOpen(false)
      setForm({ name: '', group: 'operaciones', monthlyLimit: '', branchId: branchFilter })
    } catch (error) {
      toast.error(error.message || 'No se pudo crear el presupuesto')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="presupuestos-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Select value={branchFilter} onChange={setBranchFilter} options={branchOptions} className="w-48" menuMinWidth={180} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar categorías..." className="rounded-xl border-0 bg-slate-50 px-4 py-2.5 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
        </div>
        <Button onClick={() => setModalOpen(true)} data-testid="presupuestos-new-btn"><Plus className="h-4 w-4" /> Configurar Categorías</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Total Presupuestado</p><p className="mt-1 font-heading text-2xl font-bold">{formatDOP(stats.totalBudget)}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Total Gastado</p><p className="mt-1 font-heading text-2xl font-bold text-red-500">{formatDOP(stats.spent)}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Balance Restante</p><p className="mt-1 font-heading text-2xl font-bold text-emerald-600">{formatDOP(stats.remaining)}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Alertas</p><p className="mt-1 font-heading text-2xl font-bold">{stats.overBudget}</p></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {groupOptions.map((g) => (
          <button key={g.value} type="button" onClick={() => setGroupFilter(g.value)}
            className={cn('rounded-full px-4 py-1.5 text-xs font-semibold transition-colors', groupFilter === g.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list.map((b) => {
          const spent = b.spent ?? budgetSpentForMonth(expenses, b.id)
          const pct = budgetUsagePct(spent, b.monthlyLimit)
          const remaining = Math.max(0, b.monthlyLimit - spent)
          const over = spent > b.monthlyLimit
          const txs = b.transactions || expenses.filter((e) => e.budgetId === b.id && isThisMonth(e.date))
          const open = expanded === b.id
          return (
            <Card key={b.id} className="overflow-hidden" data-testid={`budget-card-${b.id}`}>
              <button type="button" onClick={() => setExpanded(open ? null : b.id)} className="flex w-full items-start justify-between p-5 text-left">
                <div className="min-w-0 flex-1">
                  <h4 className="font-heading font-bold text-slate-900">{b.name}</h4>
                  <p className="mt-1 text-sm text-slate-500">{formatDOP(spent)} / {formatDOP(b.monthlyLimit)}</p>
                  <p className="mt-0.5 text-xs text-emerald-600">Disponible: {formatDOP(over ? 0 : remaining)}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn('h-full rounded-full transition-all', over ? 'bg-red-500' : 'bg-blue-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={over ? 'danger' : spent > 0 ? 'warning' : 'neutral'}>
                      {spent > 0 ? `${formatBudgetPct(spent, b.monthlyLimit)} usado` : 'Sin iniciar'}
                    </Badge>
                    <span className="text-xs text-slate-400">{txs.length} transacciones</span>
                  </div>
                </div>
                {open ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
              </button>
              {open && txs.length > 0 && (
                <div className="border-t border-slate-100 px-5 pb-5">
                  <BudgetTransactionsTable transactions={txs} />
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva Categoría de Presupuesto">
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Meta mensual</label><Input type="number" value={form.monthlyLimit} onChange={(e) => setForm((f) => ({ ...f, monthlyLimit: e.target.value }))} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Grupo</label><Select value={form.group} onChange={(v) => setForm((f) => ({ ...f, group: v }))} options={BUDGET_GROUPS.map((g) => ({ value: g.id, label: g.name }))} /></div>
          <Button className="w-full" onClick={submit}>Crear categoría</Button>
        </div>
      </Modal>
    </div>
  )
}
