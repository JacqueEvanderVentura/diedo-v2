import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { useConfigStore } from '@/stores/configStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { fetchPersonalReport } from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: 'activo', label: 'Activos' },
  { value: 'inactivo', label: 'Inactivos' },
]

export default function PersonalPage() {
  const branches = useConfigStore((s) => s.branches)
  const employees = useRrhhStore((s) => s.employees)
  const getEmployees = useCallback(() => employees, [employees])
  const fetcher = useCallback((params) => fetchPersonalReport(getEmployees, params), [getEmployees])
  const report = usePaginatedReport(fetcher, { branchId: '', department: '', status: '', search: '' })

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees]
  )
  const branchName = (id) => branches.find((b) => b.id === id)?.name || id

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="report-personal">
      <Link to="/reportes/generales" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600">
        <ArrowLeft className="h-4 w-4" /> Volver a Reportes
      </Link>

      <div>
        <h2 className="font-heading text-xl font-bold text-slate-900">Reporte de Personal</h2>
        <p className="text-sm text-slate-500">Directorio de empleados con filtros y exportación paginada</p>
      </div>

      <ReportFilterBar
        branchId={report.filters.branchId}
        onBranchChange={(v) => report.setFilter('branchId', v)}
        search={report.filters.search}
        onSearchChange={(v) => report.setFilter('search', v)}
        searchPlaceholder="Buscar empleado, cargo o departamento…"
        status={report.filters.status}
        onStatusChange={(v) => report.setFilter('status', v)}
        statusOptions={STATUS_OPTIONS}
        onRefresh={report.reload}
        extra={(
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Departamento</label>
            <Select
              value={report.filters.department || ''}
              onChange={(v) => report.setFilter('department', v)}
              options={[{ value: '', label: 'Todos' }, ...departments.map((d) => ({ value: d, label: d }))]}
            />
          </div>
        )}
      />

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Empleado</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Departamento</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3 text-right">Salario</th>
                <th className="px-4 py-3 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {report.loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
              ) : report.items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Sin empleados para los filtros seleccionados</td></tr>
              ) : (
                report.items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 text-slate-600">{row.position}</td>
                    <td className="px-4 py-3 text-slate-600">{row.department}</td>
                    <td className="px-4 py-3 text-slate-600">{branchName(row.branchId)}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{formatDOP(row.salary)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', row.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                        {row.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
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
            noun="empleados"
          />
        </div>
      </div>
    </div>
  )
}
