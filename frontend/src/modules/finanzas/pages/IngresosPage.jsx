import { useState, useMemo } from 'react'
import * as Icons from 'lucide-react'
import { TrendingUp, Receipt, Hash, Plus } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { fmtWhen, isThisMonth, parseWhen } from '../lib/finanzas'
import { METHOD_LABELS, METHOD_ICON } from '@/modules/crm/lib/crm'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { ExportMenu } from '../components/ExportMenu'
import { IncomeFormModal } from '../components/IncomeFormModal'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, icon: Icon, tone }) {
  const tones = { emerald: 'text-emerald-600 bg-emerald-50', brand: 'text-blue-600 bg-blue-50', slate: 'text-slate-600 bg-slate-100' }
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

function isToday(v) {
  const d = parseWhen(v)
  if (!d) return false
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

export default function IngresosPage() {
  const sales = usePosStore((s) => s.sales)
  const manualIncomes = useFinanzasStore((s) => s.manualIncomes)
  const branches = useConfigStore((s) => s.branches)

  const [period, setPeriod] = useState('month')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)

  const inPeriod = (v) => period === 'all' || isThisMonth(v)

  const allIncomes = useMemo(() => {
    const fromSales = sales.map((s) => ({
      id: s.id,
      date: s.createdAt,
      customer: s.customer?.name || 'Cliente Mostrador',
      category: s.method,
      branchId: s.branchId,
      status: 'pagado',
      amount: s.total,
      source: 'POS',
    }))
    const fromManual = manualIncomes.map((i) => ({
      id: i.id,
      date: i.date,
      customer: i.customer || '—',
      category: i.category,
      branchId: i.branchId,
      status: i.status,
      amount: i.amount,
      source: i.source,
    }))
    return [...fromSales, ...fromManual]
  }, [sales, manualIncomes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allIncomes
      .filter((i) => inPeriod(i.date))
      .filter((i) => branchFilter === 'all' || i.branchId === branchFilter)
      .filter((i) => !q || i.customer.toLowerCase().includes(q) || String(i.id).toLowerCase().includes(q) || (METHOD_LABELS[i.category] || i.category).toLowerCase().includes(q))
  }, [allIncomes, period, query, branchFilter])

  const branchNameFor = (branchId, source) => branches.find((b) => b.id === branchId)?.name || (source === 'POS' ? 'POS' : '—')

  const { rows: displayRows, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'date', dir: 'desc' },
    accessors: {
      date: (i) => new Date(i.date),
      customer: (i) => i.customer || '',
      category: (i) => METHOD_LABELS[i.category] || i.category || '',
      branch: (i) => branchNameFor(i.branchId, i.source),
      status: (i) => i.status || '',
      amount: (i) => i.amount || 0,
    },
  })

  const total = useMemo(() => filtered.reduce((a, i) => a + (i.amount || 0), 0), [filtered])
  const dailyTotal = useMemo(() => allIncomes.filter((i) => isToday(i.date)).reduce((a, i) => a + i.amount, 0), [allIncomes])
  const monthlyTotal = useMemo(() => allIncomes.filter((i) => isThisMonth(i.date)).reduce((a, i) => a + i.amount, 0), [allIncomes])
  const ticket = filtered.length ? total / filtered.length : 0

  const byMethod = useMemo(() => {
    const map = {}
    filtered.forEach((i) => { const k = i.category; map[k] = (map[k] || 0) + i.amount })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const exportCols = [
    { key: 'fecha', label: 'Fecha' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'sucursal', label: 'Sucursal' },
    { key: 'estado', label: 'Estado' },
    { key: 'monto', label: 'Monto' },
  ]
  const exportRows = filtered.map((i) => ({
    fecha: fmtWhen(i.date),
    cliente: i.customer,
    categoria: METHOD_LABELS[i.category] || i.category,
    sucursal: branches.find((b) => b.id === i.branchId)?.name || '—',
    estado: i.status,
    monto: formatDOP(i.amount),
  }))

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="ingresos-page">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-700" data-testid="ingresos-banner">
        <TrendingUp className="h-4 w-4 shrink-0" />
        Los ingresos se generan automáticamente desde las ventas del POS. También puedes registrar ingresos manuales.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1 w-fit">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)} data-testid={`ingresos-period-${p.id}`}
              className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors', period === p.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <ExportMenu title="Ingresos" columns={exportCols} rows={exportRows} filename="ingresos" />
          <Button onClick={() => setModalOpen(true)} data-testid="ingresos-new-btn"><Plus className="h-4 w-4" /> Registrar Ingreso</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Ingreso Diario Total" value={formatDOP(dailyTotal)} icon={TrendingUp} tone="emerald" />
        <SummaryCard label="Ingresos Mensuales Total" value={formatDOP(monthlyTotal)} icon={Receipt} tone="brand" />
        <SummaryCard label="Transacción Promedio" value={formatDOP(ticket)} icon={Hash} tone="slate" />
      </div>

      {byMethod.length > 0 && (
        <div>
          <h3 className="mb-3 font-heading text-lg font-bold text-slate-800">Desglose por método</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="ingresos-breakdown">
            {byMethod.map(([method, amount]) => {
              const Icon = Icons[METHOD_ICON[method]] || Icons.Circle
              const pct = total > 0 ? Math.round((amount / total) * 100) : 0
              return (
                <Card key={method} className="p-4" data-testid={`ingresos-method-${method}`}>
                  <div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-xs font-semibold">{METHOD_LABELS[method] || method}</span></div>
                  <p className="mt-2 font-heading text-lg font-bold text-slate-900">{formatDOP(amount)}</p>
                  <p className="text-xs text-slate-400">{pct}% del total</p>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <DataFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Buscar ingresos por ID, cliente o categoría..."
        showBranch
        branchId={branchFilter}
        onBranchChange={setBranchFilter}
        testId="ingresos-filters"
      />

      <Card className="overflow-hidden" data-testid="ingresos-table">
        {displayRows.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin ingresos" description="No hay ingresos en este período." className="py-12" />
        ) : (
          <ResponsiveList minTableWidth={800} columnCount={6}>
            <ResponsiveTable testId="ingresos-table" wrapCard={false}>
              <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <SortableTh column="date" className="px-6 py-4">Fecha</SortableTh>
                    <SortableTh column="customer" className="px-6 py-4">Cliente</SortableTh>
                    <SortableTh column="category" className="px-6 py-4">Categoría</SortableTh>
                    <SortableTh column="branch" className="px-6 py-4">Sucursal</SortableTh>
                    <SortableTh column="status" className="px-6 py-4">Estado</SortableTh>
                    <SortableTh column="amount" align="right" className="px-6 py-4">Monto</SortableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayRows.map((i) => {
                    const Icon = Icons[METHOD_ICON[i.category]] || Icons.Circle
                    return (
                      <tr key={i.id} className="hover:bg-slate-50/60" data-testid={`ingresos-row-${i.id}`}>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-500">{fmtWhen(i.date)}</td>
                        <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-800">{i.customer}</td>
                        <td className="px-6 py-4"><span className="inline-flex items-center gap-1.5 text-slate-600"><Icon className="h-4 w-4 text-slate-400" />{METHOD_LABELS[i.category] || i.category}</span></td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-500">{branchNameFor(i.branchId, i.source)}</td>
                        <td className="px-6 py-4"><Badge tone={i.status === 'pagado' ? 'success' : 'warning'}>{i.status === 'pagado' ? 'Pagado' : 'Pendiente'}</Badge></td>
                        <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-emerald-600">+ {formatDOP(i.amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </SortableTableProvider>
            </ResponsiveTable>
            <ResponsiveCards testId="ingresos-cards" className="p-4">
              {displayRows.map((i) => {
                const Icon = Icons[METHOD_ICON[i.category]] || Icons.Circle
                return (
                  <MobileCard key={i.id} testId={`ingresos-card-${i.id}`}>
                    <MobileCardHeader
                      title={i.customer}
                      subtitle={fmtWhen(i.date)}
                      badge={<Badge tone={i.status === 'pagado' ? 'success' : 'warning'}>{i.status === 'pagado' ? 'Pagado' : 'Pendiente'}</Badge>}
                    />
                    <MobileCardGrid>
                      <MobileField label="Categoría">
                        <span className="inline-flex items-center gap-1.5"><Icon className="h-4 w-4 text-slate-400" />{METHOD_LABELS[i.category] || i.category}</span>
                      </MobileField>
                      <MobileField label="Sucursal">{branchNameFor(i.branchId, i.source)}</MobileField>
                      <MobileField label="Monto" fullWidth>
                        <span className="font-heading font-bold text-emerald-600">+ {formatDOP(i.amount)}</span>
                      </MobileField>
                    </MobileCardGrid>
                  </MobileCard>
                )
              })}
            </ResponsiveCards>
          </ResponsiveList>
        )}
        {filtered.length > 0 && (
          <div className="border-t border-slate-100 px-6 py-3 text-right text-sm font-semibold text-slate-600">
            Ingreso Total Filtrado — {formatDOP(total)} · Mostrando {filtered.length} entradas
          </div>
        )}
      </Card>

      <IncomeFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
