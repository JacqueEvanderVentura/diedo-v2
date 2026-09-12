import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Users,
  Building2,
  Wallet,
  DollarSign,
  TrendingUp,
  ChartPie,
  Download,
  RefreshCw,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { formatDOP, formatCompact } from '@/lib/format'
import { CHART_ANIMATION } from '@/lib/chartAnimation'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { fetchDividendReport } from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { REPORT_PERIODS } from '../lib/reportes'
import {
  aggregateDividendRows,
  buildDividendCsv,
  buildPartnerPayrollCsv,
  downloadCsv,
} from '../lib/dividendsReport'

const DIVIDEND_PERIODS = REPORT_PERIODS.filter((period) => !['today', 'week'].includes(period.id))

function MoneyTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="font-heading text-sm font-bold" style={{ color: entry.fill || entry.color }}>
          {entry.name}: {formatDOP(entry.value)}
        </p>
      ))}
    </div>
  )
}

export default function DividendosPage() {
  const branches = useConfigStore((s) => s.branches)
  const sales = usePosStore((s) => s.sales)
  const expenses = useFinanzasStore((s) => s.expenses)
  const manualIncomes = useFinanzasStore((s) => s.manualIncomes)

  const getBranches = useCallback(() => branches, [branches])
  const getFinancials = useCallback(
    () => ({ sales, expenses, incomes: manualIncomes }),
    [sales, expenses, manualIncomes],
  )
  const fetcher = useCallback(
    (params) => fetchDividendReport(getBranches, params, getFinancials),
    [getBranches, getFinancials],
  )
  const report = usePaginatedReport(
    fetcher,
    { branchIds: [], search: '', period: 'month', dateFrom: null, dateTo: null },
    10,
    { key: 'dividend', dir: 'desc' },
  )

  const summary = report.summary || { partners: 0, branches: 0, totalDividends: 0, totalNetProfit: 0 }
  const analytics = useMemo(() => {
    if (report.analytics) return report.analytics
    return aggregateDividendRows(report.allItems || report.items || [])
  }, [report.analytics, report.allItems, report.items])

  const exportDetail = () => {
    downloadCsv(
      `dividendos-detalle-${report.filters.period || 'periodo'}.csv`,
      buildDividendCsv(report.items),
    )
  }

  const exportPayroll = () => {
    downloadCsv(
      `dividendos-nomina-${report.filters.period || 'periodo'}.csv`,
      buildPartnerPayrollCsv(analytics.byPartner),
    )
  }

  const partnerTotal = analytics.totals?.totalDividends ?? summary.totalDividends
  const netProfit = analytics.totals?.netProfit ?? summary.totalNetProfit ?? partnerTotal

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="report-dividendos">
      <Link to="/reportes/generales" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600">
        <ArrowLeft className="h-4 w-4" /> Volver a Reportes
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-bold text-slate-900">Reporte de Dividendos</h2>
          <p className="text-sm text-slate-500">Distribución de utilidades entre socios</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Button variant="secondary" className="w-full gap-2 sm:w-auto" onClick={report.reload}>
            <RefreshCw className="h-4 w-4" /> Calcular
          </Button>
          <Button variant="secondary" className="w-full gap-2 sm:w-auto" onClick={exportDetail}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
        </div>
      </div>

      <ReportFilterBar
        branchIds={report.filters.branchIds || []}
        onBranchIdsChange={(branchIds) => report.patchFilters({ branchIds })}
        period={report.filters.period}
        dateFrom={report.filters.dateFrom}
        dateTo={report.filters.dateTo}
        onPeriodChange={(next) => report.patchFilters(next)}
        periodOptions={DIVIDEND_PERIODS}
        showPeriod
        search={report.filters.search}
        onSearchChange={(value) => report.setFilter('search', value)}
        searchPlaceholder="Buscar socio o sucursal…"
        onRefresh={report.reload}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Utilidad neta total" value={formatDOP(netProfit)} icon={DollarSign} tone="emerald" />
        <StatCard label="Total a distribuir" value={formatDOP(partnerTotal)} icon={Wallet} tone="brand" />
        <StatCard label="Socios beneficiarios" value={analytics.totals?.partners ?? summary.partners} icon={Users} tone="violet" />
        <StatCard label="Sucursales" value={analytics.totals?.branches ?? summary.branches} icon={Building2} tone="slate" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Utilidad por sucursal" subtitle="Resultado neto del período">
          {analytics.branchChart.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin utilidades para los filtros seleccionados</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={analytics.branchChart} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip content={<MoneyTip />} />
                  <Bar dataKey="value" name="Utilidad neta" fill="#3b82f6" radius={[0, 4, 4, 0]} {...CHART_ANIMATION} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Distribución de dividendos" subtitle="Participación por socio">
          {analytics.partnerChart.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin socios para los filtros seleccionados</p>
          ) : (
            <>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={analytics.partnerChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      label={({ name, percent }) => `${name.split(' ')[0]} (${Math.round(percent * 100)}%)`}
                      {...CHART_ANIMATION}
                    >
                      {analytics.partnerChart.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<MoneyTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {analytics.partnerChart.map((entry) => (
                  <div key={entry.name} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold text-slate-800">Dividendos por socio</h3>
            <p className="text-xs text-slate-400">Totales consolidados del período</p>
          </div>
          <Button variant="secondary" size="sm" className="gap-2" onClick={exportPayroll}>
            <Download className="h-4 w-4" /> Exportar nómina
          </Button>
        </div>
        <ResponsiveList columnCount={4}>
          <ResponsiveTable testId="report-dividendos-partners-table" wrapCard={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-3">Socio</th>
                  <th className="px-4 py-3">Cédula</th>
                  <th className="px-4 py-3">Sucursales</th>
                  <th className="px-4 py-3 text-right">Dividendo total</th>
                </tr>
              </thead>
              <tbody>
                {report.loading ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
                ) : analytics.byPartner.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">Sin socios para los filtros seleccionados</td></tr>
                ) : (
                  analytics.byPartner.map((partner) => (
                    <tr key={partner.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: partner.color }} />
                          <span className="font-medium text-slate-800">{partner.partnerName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{partner.document}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {partner.branchShares.map((share) => (
                            <Badge key={`${partner.id}-${share.branchId}`} tone="neutral" className="text-xs normal-case tracking-normal">
                              {share.branchName} ({share.share}%)
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDOP(partner.totalDividend)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>
          <ResponsiveCards testId="report-dividendos-partners-cards" className="p-4">
            {!report.loading && analytics.byPartner.map((partner) => (
              <MobileCard key={partner.id} testId={`report-dividendos-partner-${partner.id}`}>
                <MobileCardHeader title={partner.partnerName} subtitle={partner.document} />
                <MobileCardGrid>
                  <MobileField label="Sucursales" fullWidth>
                    {partner.branchShares.map((share) => `${share.branchName} (${share.share}%)`).join(', ')}
                  </MobileField>
                  <MobileField label="Dividendo total" fullWidth>
                    <span className="font-semibold text-slate-900">{formatDOP(partner.totalDividend)}</span>
                  </MobileField>
                </MobileCardGrid>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-slate-500" />
          <h3 className="font-heading text-base font-semibold text-slate-800">Detalle por sucursal</h3>
        </div>
        {analytics.byBranch.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400 shadow-soft">
            Sin sucursales con socios para el período seleccionado
          </div>
        ) : (
          analytics.byBranch.map((branch) => (
            <div key={branch.branchId} className="rounded-xl border border-slate-100 bg-white p-5 shadow-soft">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-slate-800">{branch.branchName}</h4>
                <Badge tone="brand" className="normal-case tracking-normal">
                  Utilidad: {formatDOP(branch.netProfit)}
                </Badge>
              </div>
              {(branch.grossIncome != null || branch.expenses != null) && (
                <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-400">Utilidad bruta</p>
                    <p className="font-semibold text-emerald-600">{formatDOP(branch.grossIncome || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-400">Gastos</p>
                    <p className="font-semibold text-red-600">{formatDOP(branch.expenses || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs text-slate-400">Utilidad neta</p>
                    <p className="font-semibold text-blue-700">{formatDOP(branch.netProfit)}</p>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-[520px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-2 py-2">Socio</th>
                      <th className="px-2 py-2">Cédula</th>
                      <th className="px-2 py-2 text-center">Participación</th>
                      <th className="px-2 py-2 text-right">Dividendo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branch.partners.map((partner) => (
                      <tr key={`${branch.branchId}-${partner.partnerName}`} className="border-b border-slate-50">
                        <td className="px-2 py-2 font-medium text-slate-800">{partner.partnerName}</td>
                        <td className="px-2 py-2 text-slate-600">{partner.document}</td>
                        <td className="px-2 py-2 text-center">
                          <Badge tone="neutral" className="normal-case tracking-normal">{partner.share}%</Badge>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-900">{formatDOP(partner.dividend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <ChartPie className="h-5 w-5 text-slate-500" />
            <h3 className="font-heading text-base font-semibold text-slate-800">Detalle por sucursal y socio</h3>
          </div>
        </div>
        <ResponsiveList columnCount={5}>
          <ResponsiveTable testId="report-dividendos-table" wrapCard={false}>
            <SortableTableProvider sortKey={report.sortKey} sortDir={report.sortDir} onSort={report.toggleSort}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <SortableTh column="partnerName" className="px-4 py-3">Socio</SortableTh>
                  <SortableTh column="cedula" sortable={false} className="px-4 py-3">Cédula</SortableTh>
                  <SortableTh column="branchName" className="px-4 py-3">Sucursal</SortableTh>
                  <SortableTh column="share" align="right" className="px-4 py-3">Participación</SortableTh>
                  <SortableTh column="dividend" align="right" className="px-4 py-3">Dividendo</SortableTh>
                </tr>
              </thead>
              <tbody>
                {report.loading ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
                ) : report.items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Sin socios para los filtros seleccionados</td></tr>
                ) : (
                  report.items.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.partnerName}</td>
                      <td className="px-4 py-3 text-slate-600">{row.cedula}</td>
                      <td className="px-4 py-3 text-slate-600">{row.branchName}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.share}%</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDOP(row.dividend)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="report-dividendos-cards" className="p-4">
            {!report.loading && report.items.map((row) => (
              <MobileCard key={row.id} testId={`report-dividendos-card-${row.id}`}>
                <MobileCardHeader title={row.partnerName} subtitle={row.cedula} />
                <MobileCardGrid>
                  <MobileField label="Sucursal">{row.branchName}</MobileField>
                  <MobileField label="Participación">{row.share}%</MobileField>
                  <MobileField label="Dividendo" fullWidth>
                    <span className="font-semibold text-slate-900">{formatDOP(row.dividend)}</span>
                  </MobileField>
                </MobileCardGrid>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
        <div className="px-5 pb-4">
          <Pagination
            page={report.page}
            totalPages={report.totalPages}
            total={report.total}
            from={report.from}
            to={report.to}
            pageSize={report.pageSize}
            onPageChange={report.setPage}
            onPageSizeChange={report.setPageSize}
            noun="socios"
          />
        </div>
      </div>
    </div>
  )
}
