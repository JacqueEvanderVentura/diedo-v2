import { useState, useCallback } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP, formatCompact } from '@/lib/format'
import { Select } from '@/components/ui/Select'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import {
  fetchExpenseCategoryReport,
  fetchGeneralSummary,
  fetchTransactionsReport,
} from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import { useReportSummary } from '../hooks/useReportSummary'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { cn } from '@/lib/utils'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b']

function MoneyTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="font-heading text-sm font-bold" style={{ color: p.fill }}>
          {p.name}: {formatDOP(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function GeneralesPage() {
  const sales = usePosStore((s) => s.sales)
  const expenses = useFinanzasStore((s) => s.expenses)
  const manualIncomes = useFinanzasStore((s) => s.manualIncomes)
  const branches = useConfigStore((s) => s.branches)

  const [period, setPeriod] = useState('month')
  const [branchId, setBranchId] = useState('')
  const [txSearch, setTxSearch] = useState('')
  const [txType, setTxType] = useState('')
  const [catSearch, setCatSearch] = useState('')

  const getData = useCallback(
    () => ({ sales, expenses, incomes: manualIncomes }),
    [sales, expenses, manualIncomes]
  )
  const getExpenses = useCallback(() => expenses, [expenses])
  const summaryFetcher = useCallback(
    () => fetchGeneralSummary(getData, { branchId, period }),
    [getData, branchId, period]
  )
  const summary = useReportSummary(summaryFetcher, {
    totals: { ingresos: 0, gastos: 0, balance: 0 },
    incomeExpenseSeries: [],
    incomePie: [],
  })
  const { totals, incomeExpenseSeries, incomePie } = summary.data

  const txFetcher = useCallback(
    (params) => fetchTransactionsReport(getData, { ...params, branchId, period, type: txType, search: txSearch }),
    [getData, branchId, period, txType, txSearch]
  )
  const catFetcher = useCallback(
    (params) => fetchExpenseCategoryReport(getExpenses, { ...params, branchId, period, search: catSearch }),
    [getExpenses, branchId, period, catSearch]
  )

  const txReport = usePaginatedReport(txFetcher, {}, 10, { key: 'date', dir: 'desc' })
  const catReport = usePaginatedReport(catFetcher, {}, 5, { key: 'amount', dir: 'desc' })

  const branchName = (id) => branches.find((b) => b.id === id)?.name || id
  const branchLabel = branchId ? branchName(branchId) : 'Todas las sucursales'

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="reportes-generales-page">
      <ReportFilterBar
        branchId={branchId}
        onBranchChange={setBranchId}
        period={period}
        onPeriodChange={setPeriod}
        showPeriod
        showSearch={false}
        onRefresh={() => { summary.reload(); txReport.reload(); catReport.reload() }}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span>Mostrando datos de:</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{branchLabel}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ingresos totales" value={formatDOP(totals.ingresos)} icon={TrendingUp} tone="emerald" testId="report-stat-ingresos" />
        <StatCard label="Gastos totales" value={formatDOP(totals.gastos)} icon={TrendingDown} tone="red" testId="report-stat-gastos" />
        <StatCard label="Balance" value={formatDOP(totals.balance)} icon={Wallet} tone="brand" testId="report-stat-balance" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Ingresos vs Gastos" subtitle="Comparación en el período" testId="report-income-expense">
            {incomeExpenseSeries.every((d) => !d.Ingresos && !d.Gastos) ? (
              <p className="py-16 text-center text-sm text-slate-400">Sin movimientos en el período</p>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height={300} minWidth={0}>
                  <BarChart data={incomeExpenseSeries} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={formatCompact} width={56} />
                    <Tooltip content={<MoneyTip />} cursor={{ fill: '#f8fafc' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="Gastos" fill="#f87171" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        <ChartCard title="Distribución de ingresos" subtitle="Por método y categoría" testId="report-income-distribution">
          {incomePie.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin ingresos en el período</p>
          ) : (
            <>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height={200} minWidth={0}>
                  <PieChart>
                    <Pie data={incomePie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
                      {incomePie.map((e, i) => <Cell key={e.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<MoneyTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {incomePie.map((e, i) => (
                  <li key={e.name} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /> {e.name}
                    </span>
                    <span className="text-right">
                      <span className="font-semibold text-slate-800">{e.pct}%</span>
                      <span className="ml-2 text-xs text-slate-400">{formatDOP(e.value)}</span>
                    </span>
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
            <h3 className="font-heading text-base font-semibold text-slate-800">Desglose de gastos por categoría</h3>
            <p className="text-xs text-slate-400">Distribución del gasto en el período</p>
          </div>
          <input
            className="h-9 w-full max-w-xs rounded-xl border-0 bg-slate-50 px-3 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="Buscar categoría…"
            value={catSearch}
            onChange={(e) => { setCatSearch(e.target.value); catReport.setPage(1) }}
          />
        </div>
        <ResponsiveList columnCount={4}>
          <ResponsiveTable testId="report-categories-table" wrapCard={false}>
            <SortableTableProvider sortKey={catReport.sortKey} sortDir={catReport.sortDir} onSort={catReport.toggleSort}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <SortableTh column="name" className="px-4 py-3">Categoría</SortableTh>
                  <SortableTh column="amount" align="right" className="px-4 py-3">Monto</SortableTh>
                  <SortableTh column="pct" align="right" className="px-4 py-3">% del total</SortableTh>
                  <SortableTh column="pct" sortable={false} className="px-4 py-3 w-40">Distribución</SortableTh>
                </tr>
              </thead>
              <tbody>
                {catReport.loading ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
                ) : catReport.items.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Sin gastos en el período</td></tr>
                ) : (
                  catReport.items.map((row, i) => (
                    <tr key={row.name} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatDOP(row.amount)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.pct}%</td>
                      <td className="px-4 py-3">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="report-categories-cards" className="p-4">
            {!catReport.loading && catReport.items.map((row, i) => (
              <MobileCard key={row.name} testId={`report-category-card-${row.name}`}>
                <MobileCardHeader title={row.name} subtitle={`${row.pct}% del total`} />
                <MobileCardGrid>
                  <MobileField label="Monto">{formatDOP(row.amount)}</MobileField>
                  <MobileField label="Distribución" fullWidth>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    </div>
                  </MobileField>
                </MobileCardGrid>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
        <div className="px-5 pb-4">
          <Pagination
            page={catReport.page}
            totalPages={catReport.totalPages}
            total={catReport.total}
            from={catReport.from}
            to={catReport.to}
            pageSize={catReport.pageSize}
            onPageChange={catReport.setPage}
            onPageSizeChange={catReport.setPageSize}
            noun="categorías"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold text-slate-800">Historial unificado de transacciones</h3>
            <p className="text-xs text-slate-400">Ingresos y gastos combinados</p>
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
        <ResponsiveList columnCount={5}>
          <ResponsiveTable testId="report-transactions-table" wrapCard={false}>
            <SortableTableProvider sortKey={txReport.sortKey} sortDir={txReport.sortDir} onSort={txReport.toggleSort}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <SortableTh column="date" className="px-4 py-3">Fecha</SortableTh>
                  <SortableTh column="type" className="px-4 py-3">Tipo</SortableTh>
                  <SortableTh column="category" className="px-4 py-3">Categoría</SortableTh>
                  <SortableTh column="branchId" className="px-4 py-3">Sucursal</SortableTh>
                  <SortableTh column="amount" align="right" className="px-4 py-3">Monto</SortableTh>
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
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="report-transactions-cards" className="p-4">
            {!txReport.loading && txReport.items.map((row) => (
              <MobileCard key={row.id} testId={`report-tx-card-${row.id}`}>
                <MobileCardHeader
                  title={row.category}
                  subtitle={new Date(row.date).toLocaleDateString('es-DO')}
                  badge={
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', row.type === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                      {row.type === 'ingreso' ? 'INGRESO' : 'GASTO'}
                    </span>
                  }
                />
                <MobileCardGrid>
                  <MobileField label="Sucursal">{branchName(row.branchId)}</MobileField>
                  <MobileField label="Monto">
                    <span className={cn('font-semibold', row.type === 'ingreso' ? 'text-emerald-600' : 'text-red-600')}>
                      {row.type === 'ingreso' ? '+' : '-'}{formatDOP(row.amount)}
                    </span>
                  </MobileField>
                </MobileCardGrid>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
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
