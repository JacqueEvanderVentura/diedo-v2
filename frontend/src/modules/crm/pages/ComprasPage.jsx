import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ShoppingBag } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { fmtDateTime } from '../lib/crm'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { METHOD_LABELS } from '../lib/crm'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { cn } from '@/lib/utils'

function CustomerSalesTable({ sales }) {
  const { rows, sortKey, sortDir, toggleSort } = useSortedRows(sales, {
    defaultSort: { key: 'date', dir: 'desc' },
    accessors: {
      date: (s) => new Date(s.createdAt),
      method: (s) => s.method || s.paymentMethod || '',
      total: (s) => s.total || 0,
    },
  })

  return (
    <ResponsiveList columnCount={3}>
      <ResponsiveTable wrapCard={false}>
        <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <SortableTh column="date" className="pb-2">Fecha</SortableTh>
                <SortableTh column="method" className="pb-2">Método</SortableTh>
                <SortableTh column="total" align="right" className="pb-2">Total</SortableTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-2 text-slate-600">{fmtDateTime(s.createdAt)}</td>
                  <td className="py-2 text-slate-600">{METHOD_LABELS[s.method] || METHOD_LABELS[s.paymentMethod] || s.method || s.paymentMethod}</td>
                  <td className={cn('py-2 text-right font-semibold text-slate-900')}>{formatDOP(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SortableTableProvider>
      </ResponsiveTable>
      <ResponsiveCards>
        {rows.map((s) => (
          <MobileCard key={s.id}>
            <MobileCardGrid>
              <MobileField label="Fecha">{fmtDateTime(s.createdAt)}</MobileField>
              <MobileField label="Método">{METHOD_LABELS[s.method] || METHOD_LABELS[s.paymentMethod] || s.method || s.paymentMethod}</MobileField>
              <MobileField label="Total" fullWidth>
                <span className="font-semibold text-slate-900">{formatDOP(s.total)}</span>
              </MobileField>
            </MobileCardGrid>
          </MobileCard>
        ))}
      </ResponsiveCards>
    </ResponsiveList>
  )
}

export default function ComprasPage() {
  const customers = usePosStore((s) => s.customers)
  const sales = usePosStore((s) => s.sales)
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [openIds, setOpenIds] = useState(new Set())

  const byCustomer = useMemo(() => {
    const map = {}
    sales.forEach((s) => {
      if (branchFilter !== 'all' && s.branchId !== branchFilter) return
      const id = s.customer?.id
      if (!id || id === 'walk-in') return
      if (!map[id]) map[id] = { customer: s.customer, sales: [], total: 0 }
      map[id].sales.push(s)
      map[id].total += s.total || 0
    })
    return map
  }, [sales, branchFilter])

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers
      .filter((c) => c.id !== 'walk-in' && byCustomer[c.id])
      .filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [customers, byCustomer, query])

  const listItems = useMemo(
    () =>
      filteredCustomers.map((c) => ({
        customer: c,
        data: byCustomer[c.id],
        total: byCustomer[c.id]?.total || 0,
      })),
    [filteredCustomers, byCustomer]
  )

  const { rows: list, sortKey, sortDir, toggleSort } = useSortedRows(listItems, {
    defaultSort: { key: 'total', dir: 'desc' },
    accessors: {
      name: (r) => r.customer.name,
      total: (r) => r.total,
      count: (r) => r.data?.sales?.length || 0,
    },
  })

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const grandTotal = list.reduce((a, item) => a + item.total, 0)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-compras">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Compras por Cliente</h2>
        <p className="text-sm text-slate-500">{list.length} clientes con compras · {formatDOP(grandTotal)} total</p>
      </div>

      <DataFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Buscar cliente..."
        showBranch
        branchId={branchFilter}
        onBranchChange={setBranchFilter}
        testId="crm-compras-filters"
      />

      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
        <span>Ordenar por:</span>
        <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
          <div className="flex gap-1">
            <button type="button" onClick={() => toggleSort('name')} className={cn('rounded-lg px-2 py-1', sortKey === 'name' ? 'bg-blue-50 text-blue-600' : 'text-slate-500')}>Cliente</button>
            <button type="button" onClick={() => toggleSort('total')} className={cn('rounded-lg px-2 py-1', sortKey === 'total' ? 'bg-blue-50 text-blue-600' : 'text-slate-500')}>Total</button>
            <button type="button" onClick={() => toggleSort('count')} className={cn('rounded-lg px-2 py-1', sortKey === 'count' ? 'bg-blue-50 text-blue-600' : 'text-slate-500')}>Compras</button>
          </div>
        </SortableTableProvider>
      </div>

      <div className="space-y-2">
        {list.map(({ customer: c, data }) => {
          const open = openIds.has(c.id)
          return (
            <Card key={c.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50/50"
              >
                <div className="flex items-center gap-3">
                  {open ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    <p className="text-sm text-slate-500">{data.sales.length} compra(s)</p>
                  </div>
                </div>
                <p className="font-heading text-lg font-bold text-emerald-600">{formatDOP(data.total)}</p>
              </button>
              {open && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                  <CustomerSalesTable sales={data.sales} />
                </div>
              )}
            </Card>
          )
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay compras registradas por cliente.</p>}
      </div>
    </div>
  )
}
