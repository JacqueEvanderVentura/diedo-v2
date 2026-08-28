import { useState, useMemo } from 'react'
import * as Icons from 'lucide-react'
import { Search, ShoppingBag } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { SaleDetailModal } from '../components/SaleDetailModal'
import { fmtDateTime, METHOD_LABELS, METHOD_ICON } from '../lib/crm'
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
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { cn } from '@/lib/utils'

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'link', label: 'Link' },
  { id: 'cxc', label: 'Cta. Cobrar' },
]

function Chip({ label, value, tone }) {
  const tones = { brand: 'text-blue-600', slate: 'text-slate-700' }
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={cn('font-heading text-xl font-bold', tones[tone])}>{value}</p>
    </div>
  )
}

export default function VentasPage() {
  const sales = usePosStore((s) => s.sales)
  const branches = useConfigStore((s) => s.branches)
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('all')
  const [branchId, setBranchId] = useState('all')
  const [selected, setSelected] = useState(null)

  const branchMap = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sales
      .filter((s) => method === 'all' || s.method === method)
      .filter((s) => branchId === 'all' || s.branchId === branchId)
      .filter((s) => !q || (s.customer?.name || '').toLowerCase().includes(q) || (s.reference || '').toLowerCase().includes(q))
  }, [sales, query, method, branchId])

  const { rows: displayRows, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'date', dir: 'desc' },
    accessors: {
      date: (s) => new Date(s.createdAt),
      customer: (s) => s.customer?.name || '',
      branch: (s) => branchMap[s.branchId] || '',
      items: (s) => s.items?.length || 0,
      method: (s) => s.method || '',
      total: (s) => s.total || 0,
    },
  })

  const stats = useMemo(() => {
    const total = filtered.reduce((a, s) => a + (s.total || 0), 0)
    return { count: filtered.length, total }
  }, [filtered])

  const branchOptions = [{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-4">
        <Chip label="Ventas (filtro actual)" value={stats.count} tone="slate" />
        <Chip label="Monto total" value={formatDOP(stats.total)} tone="brand" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente o referencia..."
            data-testid="ventas-search"
            className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>
        <Select
          value={branchId}
          onChange={setBranchId}
          options={branchOptions}
          className="w-full sm:w-56"
          data-testid="ventas-filter-branch"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setMethod(f.id)} data-testid={`ventas-filter-${f.id}`}
            className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors', method === f.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200')}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="overflow-hidden">
          <EmptyState icon={ShoppingBag} title="Sin ventas" description="No hay ventas con esos filtros." className="py-14" />
        </Card>
      ) : (
        <ResponsiveList minTableWidth={920} columnCount={7}>
          <ResponsiveTable testId="ventas-table">
            <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <SortableTh column="date" className="px-6 py-4">Fecha</SortableTh>
                  <SortableTh column="customer" className="px-6 py-4">Cliente</SortableTh>
                  <SortableTh column="branch" className="px-6 py-4">Sucursal</SortableTh>
                  <SortableTh column="items" className="px-6 py-4">Artículos</SortableTh>
                  <SortableTh column="method" className="px-6 py-4">Método</SortableTh>
                  <SortableTh column="reference" sortable={false} className="px-6 py-4">Referencia</SortableTh>
                  <SortableTh column="total" align="right" className="px-6 py-4">Total</SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayRows.map((s) => {
                  const Icon = Icons[METHOD_ICON[s.method]] || Icons.Circle
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelected(s)}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50"
                      data-testid={`ventas-row-${s.id}`}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{fmtDateTime(s.createdAt)}</td>
                      <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-800">{s.customer?.name || 'Cliente Mostrador'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{branchMap[s.branchId] || '—'}</td>
                      <td className="max-w-[200px] truncate px-6 py-4 text-slate-500">{s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ')}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-600"><Icon className="h-4 w-4 text-slate-400" /> {METHOD_LABELS[s.method] || s.method}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{s.reference || '—'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-blue-600">{formatDOP(s.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="ventas-cards">
            {displayRows.map((s) => {
              const Icon = Icons[METHOD_ICON[s.method]] || Icons.Circle
              return (
                <MobileCard key={s.id} onClick={() => setSelected(s)} testId={`ventas-card-${s.id}`}>
                  <MobileCardHeader
                    title={s.customer?.name || 'Cliente Mostrador'}
                    subtitle={fmtDateTime(s.createdAt)}
                  />
                  <MobileCardGrid>
                    <MobileField label="Sucursal">{branchMap[s.branchId] || '—'}</MobileField>
                    <MobileField label="Método">
                      <span className="inline-flex items-center gap-1">
                        <Icon className="h-3.5 w-3.5 text-slate-400" />
                        {METHOD_LABELS[s.method] || s.method}
                      </span>
                    </MobileField>
                    <MobileField label="Artículos" fullWidth>
                      {s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ') || '—'}
                    </MobileField>
                    {s.reference ? <MobileField label="Referencia">{s.reference}</MobileField> : null}
                  </MobileCardGrid>
                  <MobileCardFooter>
                    <span />
                    <span className="font-heading text-sm font-bold text-blue-600">{formatDOP(s.total)}</span>
                  </MobileCardFooter>
                </MobileCard>
              )
            })}
          </ResponsiveCards>
        </ResponsiveList>
      )}

      <SaleDetailModal open={!!selected} onClose={() => setSelected(null)} sale={selected} />
    </div>
  )
}
