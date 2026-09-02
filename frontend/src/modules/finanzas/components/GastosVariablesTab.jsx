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
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardFooter,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { ExportMenu } from './ExportMenu'
import { ExpenseFormModal } from './ExpenseFormModal'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { Receipt } from 'lucide-react'

export function GastosVariablesTab() {
  const expenses = useFinanzasStore((s) => s.expenses)
  const expensesProjected = useFinanzasStore((s) => s.expensesProjected)
  const deleteExpense = useFinanzasStore((s) => s.deleteExpense)
  const cajaExpenses = usePosStore((s) => s.expenses)
  const branches = useConfigStore((s) => s.branches)

  const [branchFilter, setBranchFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchOptions = [{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]

  const filtered = useMemo(() => {
    const caja = expensesProjected ? [] : cajaExpenses.map((e) => ({ id: e.id, concept: e.concept, amount: e.amount, category: 'otros', date: e.createdAt, branchId: null, status: 'pagado', source: 'caja', editable: false }))
    const q = query.trim().toLowerCase()
    return [...expenses.map((e) => ({ ...e, source: e.source || 'finanzas' })), ...caja]
      .filter((e) => branchFilter === 'all' || e.branchId === branchFilter || e.source === 'caja')
      .filter((e) => !q || e.concept.toLowerCase().includes(q) || catName(e.category).toLowerCase().includes(q))
  }, [expenses, expensesProjected, cajaExpenses, branchFilter, query])

  const branchNameFor = (branchId, source) => branches.find((b) => b.id === branchId)?.name || (source === 'caja' ? 'Caja' : '—')

  const { rows: list, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'date', dir: 'desc' },
    accessors: {
      date: (e) => new Date(e.date),
      category: (e) => catName(e.category),
      concept: (e) => e.concept || '',
      branch: (e) => branchNameFor(e.branchId, e.source),
      amount: (e) => e.amount || 0,
      status: (e) => e.status || '',
    },
  })

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
  const remove = async (e) => {
    try {
      await deleteExpense(e.id)
      toast.success('Gasto eliminado')
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar el gasto')
    }
  }

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

      <DataFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Buscar gastos por descripción o categoría..."
        filters={[
          {
            id: 'branch',
            label: 'Sucursal',
            value: branchFilter,
            onChange: setBranchFilter,
            options: branchOptions,
          },
        ]}
        testId="gastos-filters"
        className="border-0 shadow-none p-0"
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex gap-2">
          <ExportMenu title="Gastos" columns={exportCols} rows={exportRows} filename="gastos" />
          <Button onClick={openNew} data-testid="gastos-new-btn"><Plus className="h-4 w-4" /> Nuevo gasto</Button>
        </div>
      </div>

      <Card className="overflow-hidden" data-testid="gastos-table">
        {list.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin gastos" description="No hay gastos con esos filtros." className="py-12" />
        ) : (
          <ResponsiveList columnCount={7}>
            <ResponsiveTable testId="gastos-table" wrapCard={false}>
              <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <SortableTh column="date" className="px-6 py-4">Fecha</SortableTh>
                    <SortableTh column="category" className="px-6 py-4">Categoría</SortableTh>
                    <SortableTh column="concept" className="px-6 py-4">Descripción</SortableTh>
                    <SortableTh column="branch" className="px-6 py-4">Sucursal</SortableTh>
                    <SortableTh column="amount" align="right" className="px-6 py-4">Monto</SortableTh>
                    <SortableTh column="status" className="px-6 py-4">Estado</SortableTh>
                    <SortableTh sortable={false} align="right" className="px-6 py-4">Acciones</SortableTh>
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
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{branchNameFor(e.branchId, e.source)}</td>
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
              </SortableTableProvider>
            </ResponsiveTable>
            <ResponsiveCards testId="gastos-cards" className="p-4">
              {list.map((e) => (
                <MobileCard key={e.id} testId={`gastos-card-${e.id}`}>
                  <MobileCardHeader
                    title={e.concept}
                    subtitle={fmtWhen(e.date)}
                    badge={
                      <div className="flex flex-wrap justify-end gap-1">
                        {e.source === 'caja' && <Badge tone="neutral">Caja</Badge>}
                        <Badge tone={e.status === 'pagado' ? 'success' : 'warning'}>{e.status === 'pagado' ? 'Pagado' : 'Pendiente'}</Badge>
                      </div>
                    }
                  />
                  <MobileCardGrid>
                    <MobileField label="Categoría">{catName(e.category)}</MobileField>
                    <MobileField label="Sucursal">{branches.find((b) => b.id === e.branchId)?.name || '—'}</MobileField>
                    <MobileField label="Monto" fullWidth>
                      <span className="font-heading font-bold text-red-500">− {formatDOP(e.amount)}</span>
                    </MobileField>
                  </MobileCardGrid>
                  {e.source !== 'caja' && (
                    <MobileCardFooter>
                      <span className="text-xs text-slate-400">Acciones</span>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </MobileCardFooter>
                  )}
                </MobileCard>
              ))}
            </ResponsiveCards>
          </ResponsiveList>
        )}
      </Card>

      <ExpenseFormModal open={modalOpen} onClose={() => setModalOpen(false)} expense={editing} mode="variable" />
    </div>
  )
}
