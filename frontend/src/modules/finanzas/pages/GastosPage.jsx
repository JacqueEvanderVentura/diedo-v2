import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, Repeat, Receipt } from 'lucide-react'
import { useFinanzasStore, catName } from '@/stores/finanzasStore'
import { usePosStore } from '@/stores/posStore'
import { formatDOP } from '@/lib/format'
import { fmtWhen, isThisMonth } from '../lib/finanzas'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ExpenseFormModal } from '../components/ExpenseFormModal'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, icon: Icon, tone }) {
  const tones = {
    emerald: 'text-emerald-600 bg-emerald-50',
    red: 'text-red-600 bg-red-50',
    slate: 'text-slate-600 bg-slate-100',
    brand: 'text-blue-600 bg-blue-50',
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="truncate font-heading text-lg font-bold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

const PERIODS = [{ id: 'month', label: 'Mes actual' }, { id: 'all', label: 'Todo' }]

export default function GastosPage() {
  const expenses = useFinanzasStore((s) => s.expenses)
  const fixedExpenses = useFinanzasStore((s) => s.fixedExpenses)
  const deleteExpense = useFinanzasStore((s) => s.deleteExpense)
  const deleteFixed = useFinanzasStore((s) => s.deleteFixed)
  const cajaExpenses = usePosStore((s) => s.expenses)
  const sales = usePosStore((s) => s.sales)

  const [period, setPeriod] = useState('month')
  const [modalOpen, setModalOpen] = useState(false)
  const [mode, setMode] = useState('variable')
  const [editing, setEditing] = useState(null)

  const inPeriod = (v) => period === 'all' || isThisMonth(v)

  // Gastos variables = registrados en finanzas + gastos de caja (solo lectura).
  const variableList = useMemo(() => {
    const caja = cajaExpenses.map((e) => ({ id: e.id, concept: e.concept, amount: e.amount, category: 'otros', date: e.createdAt, source: 'caja' }))
    return [...expenses.map((e) => ({ ...e, source: 'finanzas' })), ...caja]
      .filter((e) => inPeriod(e.date))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [expenses, cajaExpenses, period])

  const totals = useMemo(() => {
    const ingresos = sales.filter((s) => inPeriod(s.createdAt)).reduce((a, s) => a + (s.total || 0), 0)
    const variables = variableList.reduce((a, e) => a + e.amount, 0)
    const fijos = fixedExpenses.reduce((a, e) => a + e.amount, 0)
    return { ingresos, variables, fijos, balance: ingresos - variables - fijos }
  }, [sales, variableList, fixedExpenses, period])

  const openNew = (m) => { setMode(m); setEditing(null); setModalOpen(true) }
  const openEdit = (e, m) => { setMode(m); setEditing(e); setModalOpen(true) }
  const removeVar = (e) => { deleteExpense(e.id); toast.success('Gasto eliminado') }
  const removeFixed = (e) => { deleteFixed(e.id); toast.success('Gasto fijo eliminado') }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      {/* Period toggle */}
      <div className="flex rounded-xl bg-slate-100 p-1 w-fit">
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)} data-testid={`gastos-period-${p.id}`}
            className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors', period === p.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Ingresos (período)" value={formatDOP(totals.ingresos)} icon={TrendingUp} tone="emerald" />
        <SummaryCard label="Gastos variables" value={formatDOP(totals.variables)} icon={TrendingDown} tone="red" />
        <SummaryCard label="Gastos fijos (mensual)" value={formatDOP(totals.fijos)} icon={Repeat} tone="slate" />
        <SummaryCard label="Balance estimado" value={formatDOP(totals.balance)} icon={Wallet} tone={totals.balance >= 0 ? 'brand' : 'red'} />
      </div>

      {/* Variable expenses */}
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold text-slate-800">Gastos variables</h3>
        <Button onClick={() => openNew('variable')} data-testid="gastos-new-btn">
          <Plus className="h-4 w-4" /> Nuevo gasto
        </Button>
      </div>

      <Card className="overflow-hidden" data-testid="gastos-table">
        {variableList.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin gastos" description="No hay gastos en este período." className="py-12" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Concepto</th>
                  <th className="px-6 py-4">Categoría</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {variableList.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-slate-50/60" data-testid={`gastos-row-${e.id}`}>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-800">{e.concept}</span>
                      {e.source === 'caja' && <Badge tone="neutral" className="ml-2">Caja</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{catName(e.category)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{fmtWhen(e.date)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-red-500">− {formatDOP(e.amount)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {e.source === 'caja' ? (
                          <span className="text-xs text-slate-400">Desde caja</span>
                        ) : (
                          <>
                            <button onClick={() => openEdit(e, 'variable')} data-testid={`gastos-edit-${e.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => removeVar(e)} data-testid={`gastos-delete-${e.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Fixed expenses */}
      <div className="flex items-center justify-between pt-2">
        <h3 className="font-heading text-lg font-bold text-slate-800">Gastos fijos <span className="text-sm font-medium text-slate-400">(mensuales)</span></h3>
        <Button variant="secondary" onClick={() => openNew('fixed')} data-testid="gastos-fixed-new-btn">
          <Plus className="h-4 w-4" /> Nuevo gasto fijo
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="gastos-fixed-list">
        {fixedExpenses.length === 0 ? (
          <Card className="col-span-full"><EmptyState icon={Repeat} title="Sin gastos fijos" description="Agrega tus costos recurrentes mensuales." className="py-10" /></Card>
        ) : (
          fixedExpenses.map((e) => (
            <Card key={e.id} className="group p-4" data-testid={`gastos-fixed-${e.id}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{e.concept}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{catName(e.category)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(e, 'fixed')} data-testid={`gastos-fixed-edit-${e.id}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeFixed(e)} data-testid={`gastos-fixed-delete-${e.id}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-3 font-heading text-xl font-bold text-slate-900">{formatDOP(e.amount)}<span className="text-sm font-medium text-slate-400">/mes</span></p>
            </Card>
          ))
        )}
      </div>

      <ExpenseFormModal open={modalOpen} onClose={() => setModalOpen(false)} expense={editing} mode={mode} />
    </div>
  )
}
