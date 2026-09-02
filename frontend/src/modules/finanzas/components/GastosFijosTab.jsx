import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, DollarSign } from 'lucide-react'
import { useFinanzasStore, catName } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
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
import { ExpenseFormModal } from './ExpenseFormModal'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { Repeat } from 'lucide-react'

export function GastosFijosTab() {
  const fixedExpenses = useFinanzasStore((s) => s.fixedExpenses)
  const deleteFixed = useFinanzasStore((s) => s.deleteFixed)
  const payFixed = useFinanzasStore((s) => s.payFixed)
  const isFixedPaidThisMonth = useFinanzasStore((s) => s.isFixedPaidThisMonth)
  const branches = useConfigStore((s) => s.branches)

  const [branchFilter, setBranchFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchOptions = [{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return fixedExpenses
      .filter((e) => branchFilter === 'all' || e.branchId === branchFilter)
      .filter((e) => !q || e.concept.toLowerCase().includes(q) || catName(e.category).toLowerCase().includes(q))
  }, [fixedExpenses, branchFilter, query])

  const { rows: list, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'dayOfMonth', dir: 'asc' },
    accessors: {
      dayOfMonth: (e) => e.dayOfMonth || 0,
      concept: (e) => e.concept || '',
      category: (e) => catName(e.category),
      amount: (e) => e.amount || 0,
      paid: (e) => isFixedPaidThisMonth(e) ? 1 : 0,
    },
  })

  const stats = useMemo(() => {
    const total = list.reduce((a, e) => a + e.amount, 0)
    const paid = list.filter((e) => isFixedPaidThisMonth(e)).reduce((a, e) => a + e.amount, 0)
    return { total, paid, pending: total - paid }
  }, [list, isFixedPaidThisMonth])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (e) => { setEditing(e); setModalOpen(true) }
  const remove = async (e) => {
    try {
      await deleteFixed(e.id)
      toast.success('Gasto fijo eliminado')
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar el gasto fijo')
    }
  }
  const pay = async (e) => {
    try {
      await payFixed(e.id)
      toast.success(`Pago registrado: ${e.concept}`)
    } catch (error) {
      toast.error(error.message || 'No se pudo registrar el pago')
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Gastos Fijos</p>
          <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{formatDOP(stats.total)}</p>
          <p className="mt-1 text-xs text-slate-400">Estimación mensual</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pagado este mes</p>
          <p className="mt-1 font-heading text-2xl font-bold text-emerald-600">{formatDOP(stats.paid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pendiente</p>
          <p className="mt-1 font-heading text-2xl font-bold text-amber-600">{formatDOP(stats.pending)}</p>
        </Card>
      </div>

      <DataFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Buscar gasto fijo..."
        filters={[
          {
            id: 'branch',
            label: 'Sucursal',
            value: branchFilter,
            onChange: setBranchFilter,
            options: branchOptions,
          },
        ]}
        testId="gastos-fixed-filters"
        className="border-0 shadow-none p-0"
      />

      <div className="flex justify-end">
        <Button onClick={openNew} data-testid="gastos-fixed-new-btn"><Plus className="h-4 w-4" /> Nuevo Gasto Fijo</Button>
      </div>

      <Card className="overflow-hidden" data-testid="gastos-fixed-table">
        {list.length === 0 ? (
          <EmptyState icon={Repeat} title="Sin gastos fijos" description="Agrega tus costos recurrentes mensuales." className="py-12" />
        ) : (
          <ResponsiveList minTableWidth={800} columnCount={6}>
            <ResponsiveTable testId="gastos-fixed-table" wrapCard={false}>
              <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <SortableTh column="dayOfMonth" className="px-6 py-4">Día</SortableTh>
                    <SortableTh column="concept" className="px-6 py-4">Nombre del Gasto</SortableTh>
                    <SortableTh column="category" className="px-6 py-4">Categoría</SortableTh>
                    <SortableTh column="amount" align="right" className="px-6 py-4">Monto</SortableTh>
                    <SortableTh column="paid" className="px-6 py-4">Estado Mes Actual</SortableTh>
                    <SortableTh sortable={false} align="right" className="px-6 py-4">Acciones</SortableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.map((e) => {
                    const paid = isFixedPaidThisMonth(e)
                    return (
                      <tr key={e.id} className="hover:bg-slate-50/60" data-testid={`gastos-fixed-${e.id}`}>
                        <td className="px-6 py-4"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{e.dayOfMonth} Día</span></td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-800">{e.concept}</p>
                          <p className="text-xs text-slate-400">{branches.find((b) => b.id === e.branchId)?.name}</p>
                        </td>
                        <td className="px-6 py-4"><Badge tone="neutral">{catName(e.category)}</Badge></td>
                        <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-slate-900">{formatDOP(e.amount)}</td>
                        <td className="px-6 py-4"><Badge tone={paid ? 'success' : 'warning'}>{paid ? 'Pagado' : 'Pendiente'}</Badge></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {!paid && (
                              <Button size="sm" onClick={() => pay(e)} data-testid={`gastos-fixed-pay-${e.id}`}>
                                <DollarSign className="h-3.5 w-3.5" /> PAGAR
                              </Button>
                            )}
                            <button onClick={() => openEdit(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => remove(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </SortableTableProvider>
            </ResponsiveTable>
            <ResponsiveCards testId="gastos-fixed-cards" className="p-4">
              {list.map((e) => {
                const paid = isFixedPaidThisMonth(e)
                return (
                  <MobileCard key={e.id} testId={`gastos-fixed-card-${e.id}`}>
                    <MobileCardHeader
                      title={e.concept}
                      subtitle={branches.find((b) => b.id === e.branchId)?.name}
                      badge={<Badge tone={paid ? 'success' : 'warning'}>{paid ? 'Pagado' : 'Pendiente'}</Badge>}
                    />
                    <MobileCardGrid>
                      <MobileField label="Día">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{e.dayOfMonth} Día</span>
                      </MobileField>
                      <MobileField label="Categoría"><Badge tone="neutral">{catName(e.category)}</Badge></MobileField>
                      <MobileField label="Monto" fullWidth>
                        <span className="font-heading font-bold text-slate-900">{formatDOP(e.amount)}</span>
                      </MobileField>
                    </MobileCardGrid>
                    <MobileCardFooter>
                      {!paid ? (
                        <Button size="sm" onClick={() => pay(e)} data-testid={`gastos-fixed-pay-${e.id}`}>
                          <DollarSign className="h-3.5 w-3.5" /> PAGAR
                        </Button>
                      ) : <span />}
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </MobileCardFooter>
                  </MobileCard>
                )
              })}
            </ResponsiveCards>
          </ResponsiveList>
        )}
      </Card>

      <ExpenseFormModal open={modalOpen} onClose={() => setModalOpen(false)} expense={editing} mode="fixed" />
    </div>
  )
}
