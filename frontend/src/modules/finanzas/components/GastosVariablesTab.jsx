import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { useFinanzasStore, catName } from '@/stores/finanzasStore'
import { usePosStore } from '@/stores/posStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { fmtWhen, isThisMonth } from '../lib/finanzas'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { ExportMenu } from './ExportMenu'
import { ExpenseFormModal } from './ExpenseFormModal'
import { Receipt } from 'lucide-react'

export function GastosVariablesTab() {
  const expenses = useFinanzasStore((s) => s.expenses)
  const deleteExpense = useFinanzasStore((s) => s.deleteExpense)
  const cajaExpenses = usePosStore((s) => s.expenses)
  const branches = useConfigStore((s) => s.branches)

  const [branchFilter, setBranchFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchOptions = [{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]

  const list = useMemo(() => {
    const caja = cajaExpenses.map((e) => ({ id: e.id, concept: e.concept, amount: e.amount, category: 'otros', date: e.createdAt, branchId: null, status: 'pagado', source: 'caja' }))
    const q = query.trim().toLowerCase()
    return [...expenses.map((e) => ({ ...e, source: 'finanzas' })), ...caja]
      .filter((e) => branchFilter === 'all' || e.branchId === branchFilter || e.source === 'caja')
      .filter((e) => !q || e.concept.toLowerCase().includes(q) || catName(e.category).toLowerCase().includes(q))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [expenses, cajaExpenses, branchFilter, query])

  const monthTotal = useMemo(() => list.filter((e) => isThisMonth(e.date)).reduce((a, e) => a + e.amount, 0), [list])

  const exportCols = [
    { key: 'fecha', label: 'Fecha' },
    { key: 'concepto', label: 'Descripción' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'sucursal', label: 'Sucursal' },
    { key: 'monto', label: 'Monto' },
    { key: 'estado', label: 'Estado' },
  ]
  const exportRows = list.map((e) => ({
    fecha: fmtWhen(e.date),
    concepto: e.concept,
    categoria: catName(e.category),
    sucursal: branches.find((b) => b.id === e.branchId)?.name || 'Caja',
    monto: formatDOP(e.amount),
    estado: e.status || 'pagado',
  }))

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (e) => { setEditing(e); setModalOpen(true) }
  const remove = (e) => { deleteExpense(e.id); toast.success('Gasto eliminado') }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Gasto mensual total</p>
          <p className="mt-1 font-heading text-2xl font-bold text-red-600">{formatDOP(monthTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Transacciones</p>
          <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{list.length}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar gastos por descripción o categoría..." className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600" />
          </div>
          <Select value={branchFilter} onChange={setBranchFilter} options={branchOptions} className="w-48" menuMinWidth={200} />
        </div>
        <div className="flex gap-2">
          <ExportMenu title="Gastos" columns={exportCols} rows={exportRows} filename="gastos" />
          <Button onClick={openNew} data-testid="gastos-new-btn"><Plus className="h-4 w-4" /> Nuevo gasto</Button>
        </div>
      </div>

      <Card className="overflow-hidden" data-testid="gastos-table">
        {list.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin gastos" description="No hay gastos con esos filtros." className="py-12" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Categoría</th>
                  <th className="px-6 py-4">Descripción</th>
                  <th className="px-6 py-4">Sucursal</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {list.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60" data-testid={`gastos-row-${e.id}`}>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{fmtWhen(e.date)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{catName(e.category)}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      {e.concept}
                      {e.source === 'caja' && <Badge tone="neutral" className="ml-2">Caja</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{branches.find((b) => b.id === e.branchId)?.name || '—'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-red-500">− {formatDOP(e.amount)}</td>
                    <td className="px-6 py-4"><Badge tone={e.status === 'pagado' ? 'success' : 'warning'}>{e.status === 'pagado' ? 'Pagado' : 'Pendiente'}</Badge></td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        {e.source === 'caja' ? (
                          <span className="text-xs text-slate-400">Desde caja</span>
                        ) : (
                          <>
                            <button onClick={() => openEdit(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => remove(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
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

      <ExpenseFormModal open={modalOpen} onClose={() => setModalOpen(false)} expense={editing} mode="variable" />
    </div>
  )
}
