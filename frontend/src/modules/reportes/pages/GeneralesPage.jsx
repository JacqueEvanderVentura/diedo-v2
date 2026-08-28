import { useState, useMemo, useCallback } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp, Hash, Receipt } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP, formatCompact } from '@/lib/format'
import { METHOD_LABELS } from '@/modules/crm/lib/crm'
import { Select } from '@/components/ui/Select'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import { inPeriod, buildSeries } from '../lib/reportes'
import { fetchTransactionsReport } from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import { cn } from '@/lib/utils'

const METHOD_COLORS = { efectivo: '#10b981', tarjeta: '#3b82f6', transferencia: '#8b5cf6', link: '#f59e0b', cxc: '#ef4444' }

function MoneyTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label ?? payload[0].name}</p>
      <p className="font-heading text-sm font-bold text-slate-900">{formatDOP(payload[0].value)}</p>
    </div>
  )
}

export default function GeneralesPage() {
  const sales = usePosStore((s) => s.sales)
  const expenses = useFinanzasStore((s) => s.expenses)
  const manualIncomes = useFinanzasStore((s) => s.manualIncomes)
  const branches = useConfigStore((s) => s.branches)

  const [period, setPeriod] = useState('week')
  const [branchId, setBranchId] = useState('')
  const [txSearch, setTxSearch] = useState('')
  const [txType, setTxType] = useState('')

  const filtered = useMemo(
    () => sales.filter((s) => inPeriod(s.createdAt, period) && (!branchId || s.branchId === branchId)),
    [sales, period, branchId]
  )
  const total = useMemo(() => filtered.reduce((a, s) => a + (s.total || 0), 0), [filtered])
  const ticket = filtered.length ? total / filtered.length : 0

  const daily = useMemo(() => buildSeries(filtered, period, (s) => s.createdAt, (s) => s.total || 0), [filtered, period])
  const byMethod = useMemo(() => {
    const map = {}
    filtered.forEach((s) => { map[s.method] = (map[s.method] || 0) + (s.total || 0) })
    return Object.entries(map).map(([id, value]) => ({ id, name: METHOD_LABELS[id] || id, value }))
  }, [filtered])

  const getData = useCallback(
    () => ({ sales, expenses, incomes: manualIncomes }),
    [sales, expenses, manualIncomes]
  )
  const txFetcher = useCallback(
    (params) => fetchTransactionsReport(getData, { ...params, branchId, period, type: txType, search: txSearch }),
    [getData, branchId, period, txType, txSearch]
  )
  const txReport = usePaginatedReport(txFetcher, {}, 10)

  const branchName = (id) => branches.find((b) => b.id === id)?.name || id

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <ReportFilterBar
        branchId={branchId}
        onBranchChange={setBranchId}
        period={period}
        onPeriodChange={setPeriod}
        showPeriod
        showSearch={false}
        onRefresh={txReport.reload}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ingresos totales" value={formatDOP(total)} icon={TrendingUp} tone="emerald" testId="report-stat-ingresos" />
        <StatCard label="N.º de ventas" value={filtered.length} icon={Hash} tone="brand" testId="report-stat-ventas" />
        <StatCard label="Ticket promedio" value={formatDOP(ticket)} icon={Receipt} tone="slate" testId="report-stat-ticket" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Ventas por día" subtitle="Monto vendido en el período" testId="report-sales-daily">
            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">Sin ventas en el período</p>
            ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <BarChart data={daily} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={formatCompact} width={56} />
                  <Tooltip content={<MoneyTip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
          </ChartCard>
        </div>

        <ChartCard title="Ventas por método" subtitle="Distribución del ingreso" testId="report-sales-method">
          {byMethod.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin ventas en el período</p>
          ) : (
            <>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height={220} minWidth={0}>
                  <PieChart>
                    <Pie data={byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} isAnimationActive={false}>
                      {byMethod.map((e) => <Cell key={e.id} fill={METHOD_COLORS[e.id] || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip content={<MoneyTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {byMethod.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: METHOD_COLORS[e.id] || '#94a3b8' }} /> {e.name}
                    </span>
                    <span className="font-semibold text-slate-800">{formatDOP(e.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold text-slate-800">Historial de transacciones</h3>
            <p className="text-xs text-slate-400">Ingresos y gastos combinados — paginado</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Select
                value={txType}
                onChange={setTxType}
                options={[
                  { value: '', label: 'Todos los tipos' },
                  { value: 'ingreso', label: 'Ingresos' },
                  { value: 'gasto', label: 'Gastos' },
                ]}
                size="sm"
              />
            </div>
            <input
              className="h-9 rounded-xl border-0 bg-slate-50 px-3 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Buscar categoría o sucursal…"
              value={txSearch}
              onChange={(e) => { setTxSearch(e.target.value); txReport.setPage(1) }}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {txReport.loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
              ) : txReport.items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Sin transacciones</td></tr>
              ) : (
                txReport.items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 text-slate-500">{new Date(row.date).toLocaleDateString('es-DO')}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', row.type === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                        {row.type === 'ingreso' ? 'INGRESO' : 'GASTO'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.category}</td>
                    <td className="px-4 py-3 text-slate-600">{branchName(row.branchId)}</td>
                    <td className={cn('px-4 py-3 text-right font-semibold', row.type === 'ingreso' ? 'text-emerald-600' : 'text-red-600')}>
                      {row.type === 'ingreso' ? '+' : '-'}{formatDOP(row.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 pb-4">
          <Pagination
            page={txReport.page}
            totalPages={txReport.totalPages}
            total={txReport.total}
            from={txReport.from}
            to={txReport.to}
            pageSize={txReport.pageSize}
            onPageChange={txReport.setPage}
            onPageSizeChange={txReport.setPageSize}
            noun="transacciones"
          />
        </div>
      </div>
    </div>
  )
}
