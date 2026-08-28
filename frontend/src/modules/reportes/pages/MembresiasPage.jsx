import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Users, DollarSign, Receipt, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatDOP } from '@/lib/format'
import { useConfigStore } from '@/stores/configStore'
import { MEMBERSHIP_PLANS, MEMBERSHIP_STATUSES } from '@/data/reportes'
import { fetchMembershipReport } from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { StatCard } from '../components/ReportPrimitives'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'

const STATUS_TONE = {
  activo: 'bg-emerald-100 text-emerald-700',
  proximo: 'bg-amber-100 text-amber-700',
  vencido: 'bg-red-100 text-red-700',
  inactivo: 'bg-slate-100 text-slate-600',
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function MembresiasPage() {
  const branches = useConfigStore((s) => s.branches)
  const branchName = (id) => branches.find((b) => b.id === id)?.name || id

  const fetcher = useCallback((params) => fetchMembershipReport(params), [])
  const report = usePaginatedReport(fetcher, { branchId: '', status: '', search: '', plan: '' })

  const summary = report.summary || { activeCount: 0, mrr: 0, avgTicket: 0, proximo: 0, vencido: 0 }
  const growth = useMemo(
    () => ['mar', 'abr', 'may', 'jun', 'jul', 'ago'].map((m, i) => ({ label: m, value: 9000 + i * 4500 })),
    []
  )

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="report-membresias">
      <Link to="/reportes/generales" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600">
        <ArrowLeft className="h-4 w-4" /> Volver a Reportes
      </Link>

      <div>
        <h2 className="font-heading text-xl font-bold text-slate-900">Reporte de Membresías</h2>
        <p className="text-sm text-slate-500">Control de ingresos recurrentes y clientes activos</p>
      </div>

      <ReportFilterBar
        branchId={report.filters.branchId}
        onBranchChange={(v) => report.setFilter('branchId', v)}
        search={report.filters.search}
        onSearchChange={(v) => report.setFilter('search', v)}
        searchPlaceholder="Buscar socio o membresía…"
        status={report.filters.status}
        onStatusChange={(v) => report.setFilter('status', v)}
        statusOptions={MEMBERSHIP_STATUSES.map((s) => ({ value: s.id, label: s.label }))}
        onRefresh={report.reload}
        extra={(
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Plan</label>
            <Select
              value={report.filters.plan || ''}
              onChange={(v) => report.setFilter('plan', v)}
              options={[{ value: '', label: 'Todos los planes' }, ...MEMBERSHIP_PLANS.map((p) => ({ value: p, label: p }))]}
            />
          </div>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Miembros activos" value={summary.activeCount} icon={Users} tone="brand" sub="+30 este mes" />
        <StatCard label="Monto recurrente (MRR)" value={formatDOP(summary.mrr)} icon={DollarSign} tone="emerald" sub="+12% vs mes anterior" />
        <StatCard label="Ticket promedio" value={formatDOP(summary.avgTicket)} icon={Receipt} tone="slate" sub={`Basado en ${summary.activeCount} membresías activas`} />
        <StatCard label="Próximos a vencer" value={summary.proximo} icon={TrendingUp} tone="amber" sub={`${summary.vencido} vencidos`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-soft lg:col-span-2">
          <h3 className="font-heading text-base font-semibold text-slate-800">Crecimiento mensual</h3>
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height={224} minWidth={0}>
              <BarChart data={growth}>
                <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip formatter={(v) => formatDOP(v)} />
                <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-soft">
          <h3 className="font-heading text-base font-semibold text-slate-800">Resumen de estado</h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between"><span className="text-slate-500">Activos (pagado 30 días)</span><span className="font-semibold text-emerald-600">{summary.activeCount}</span></li>
            <li className="flex justify-between"><span className="text-slate-500">Próximos a vencer (7 días)</span><span className="font-semibold text-amber-600">{summary.proximo}</span></li>
            <li className="flex justify-between"><span className="text-slate-500">Vencidos</span><span className="font-semibold text-red-600">{summary.vencido}</span></li>
          </ul>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Las membresías se consideran activas si el cliente realizó un pago en los últimos 30 días.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-heading text-base font-semibold text-slate-800">Listado de miembros</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Membresía</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Último pago</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {report.loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
              ) : report.items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Sin resultados para los filtros seleccionados</td></tr>
              ) : (
                report.items.map((row) => {
                  const meta = MEMBERSHIP_STATUSES.find((s) => s.id === row.status)
                  return (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.clientName}</td>
                      <td className="px-4 py-3 text-slate-600">{row.plan}</td>
                      <td className="px-4 py-3 text-slate-600">{branchName(row.branchId)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatShortDate(row.lastPaymentAt)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{formatDOP(row.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_TONE[row.status])}>
                          {meta?.label || row.status}
                        </span>
                      </td>
                    </tr>
                  )
                })
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
            noun="miembros"
          />
        </div>
      </div>
    </div>
  )
}
