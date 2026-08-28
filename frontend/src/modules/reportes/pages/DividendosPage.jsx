import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Users, Building2, Wallet } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { useConfigStore } from '@/stores/configStore'
import { fetchDividendReport } from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { StatCard } from '../components/ReportPrimitives'

export default function DividendosPage() {
  const branches = useConfigStore((s) => s.branches)
  const getBranches = useCallback(() => branches, [branches])
  const fetcher = useCallback((params) => fetchDividendReport(getBranches, params), [getBranches])
  const report = usePaginatedReport(fetcher, { branchId: '', search: '' })
  const summary = report.summary || { partners: 0, branches: 0, totalDividends: 0 }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="report-dividendos">
      <Link to="/reportes/generales" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600">
        <ArrowLeft className="h-4 w-4" /> Volver a Reportes
      </Link>

      <div>
        <h2 className="font-heading text-xl font-bold text-slate-900">Reporte de Dividendos</h2>
        <p className="text-sm text-slate-500">Distribución de utilidades entre socios</p>
      </div>

      <ReportFilterBar
        branchId={report.filters.branchId}
        onBranchChange={(v) => report.setFilter('branchId', v)}
        search={report.filters.search}
        onSearchChange={(v) => report.setFilter('search', v)}
        searchPlaceholder="Buscar socio o sucursal…"
        onRefresh={report.reload}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Socios beneficiarios" value={summary.partners} icon={Users} tone="brand" />
        <StatCard label="Sucursales" value={summary.branches} icon={Building2} tone="violet" />
        <StatCard label="Dividendos totales" value={formatDOP(summary.totalDividends)} icon={Wallet} tone="emerald" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Socio</th>
                <th className="px-4 py-3">Cédula</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3 text-right">Participación</th>
                <th className="px-4 py-3 text-right">Dividendo</th>
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
        </div>
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
