import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { DollarSign, Calendar, Users, Target, Download } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { exportCsv } from '@/modules/finanzas/lib/export'
import { Button } from '@/components/ui/Button'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { useAgendaStore } from '@/stores/agendaStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { useInventarioStore } from '@/stores/inventarioStore'
import { EMPLOYEES as AGENDA_EMPLOYEES } from '@/data/agenda'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import { buildPersonalReport } from '../lib/personalReport'
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
import { useSortedRows } from '@/hooks/useTableControls'

const TABS = [
  { id: 'usuarios', label: 'Ventas y Creación de Citas (Usuarios)' },
  { id: 'empleados', label: 'Prestación de Servicios (Empleados)' },
]

export default function PersonalPage() {
  const sales = usePosStore((s) => s.sales)
  const appointments = useAgendaStore((s) => s.appointments)
  const users = useConfigStore((s) => s.users)
  const employees = useRrhhStore((s) => s.employees)
  const products = useCatalogStore((s) => s.products)
  const movements = useInventarioStore((s) => s.movements)
  const supplies = useMemo(() => products.filter((p) => p.type === 'supply'), [products])

  const [period, setPeriod] = useState('month')
  const [branchId, setBranchId] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('usuarios')

  const report = useMemo(
    () => buildPersonalReport({ sales, appointments, users, employees, agendaStaff: AGENDA_EMPLOYEES, movements, supplies, branchId, period, search }),
    [sales, appointments, users, employees, movements, supplies, branchId, period, search]
  )

  const { rows: byUserRows, sortKey: userSortKey, sortDir: userSortDir, toggleSort: toggleUserSort } = useSortedRows(report.byUser, {
    defaultSort: { key: 'salesTotal', dir: 'desc' },
    accessors: {
      name: (r) => r.name,
      role: (r) => r.role || '',
      salesCount: (r) => r.salesCount || 0,
      salesTotal: (r) => r.salesTotal || 0,
      appointmentsCreated: (r) => r.appointmentsCreated || 0,
      avgTicket: (r) => r.avgTicket || 0,
    },
  })

  const { rows: byEmployeeRows, sortKey: empSortKey, sortDir: empSortDir, toggleSort: toggleEmpSort } = useSortedRows(report.byEmployee, {
    defaultSort: { key: 'revenue', dir: 'desc' },
    accessors: {
      name: (r) => r.name,
      position: (r) => r.position || '',
      appointmentsAttended: (r) => r.appointmentsAttended || 0,
      noShows: (r) => r.noShows || 0,
      revenue: (r) => r.revenue || 0,
      avgTicket: (r) => r.avgTicket || 0,
    },
  })

  const { rows: supplyRows, sortKey: supplySortKey, sortDir: supplySortDir, toggleSort: toggleSupplySort } = useSortedRows(report.supplyUsage, {
    defaultSort: { key: 'qty', dir: 'desc' },
    accessors: {
      employeeName: (r) => r.employeeName || '',
      supplyName: (r) => r.supplyName || '',
      qty: (r) => r.qty || 0,
      appointmentsCount: (r) => r.appointmentsCount || 0,
      summary: (r) => r.summary || '',
    },
  })

  const salesChart = useMemo(
    () => report.byUser.filter((u) => u.salesTotal > 0).slice(0, 10).map((u) => ({ name: u.name, value: u.salesTotal })),
    [report.byUser]
  )

  const createdChart = useMemo(
    () => report.byUser.filter((u) => u.appointmentsCreated > 0).slice(0, 10).map((u) => ({ name: u.name, value: u.appointmentsCreated })),
    [report.byUser]
  )

  const exportDetailCsv = () => {
    if (tab === 'usuarios') {
      exportCsv({
        title: 'Reporte personal — usuarios',
        filename: 'reporte_personal_usuarios',
        columns: [
          { key: 'name', label: 'Nombre' },
          { key: 'role', label: 'Rol' },
          { key: 'salesCount', label: 'Ventas (cant.)' },
          { key: 'salesTotal', label: 'Total ventas' },
          { key: 'appointmentsCreated', label: 'Citas creadas' },
          { key: 'avgTicket', label: 'Ticket prom.' },
        ],
        rows: report.byUser.map((r) => ({
          ...r,
          salesTotal: formatDOP(r.salesTotal),
          avgTicket: formatDOP(r.avgTicket),
        })),
      })
      return
    }
    exportCsv({
      title: 'Reporte personal — empleados',
      filename: 'reporte_personal_empleados',
      columns: [
        { key: 'name', label: 'Empleado' },
        { key: 'position', label: 'Cargo' },
        { key: 'appointmentsAttended', label: 'Citas atendidas' },
        { key: 'noShows', label: 'No-shows' },
        { key: 'revenue', label: 'Ingresos servicios' },
        { key: 'avgTicket', label: 'Ticket prom.' },
      ],
      rows: report.byEmployee.map((r) => ({
        ...r,
        revenue: formatDOP(r.revenue),
        avgTicket: formatDOP(r.avgTicket),
      })),
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="report-personal">
      <div>
        <h2 className="font-heading text-xl font-bold text-slate-900">Reporte de Personal</h2>
        <p className="text-sm text-slate-500">Desempeño individual, ventas, agenda e insumos</p>
      </div>

      <ReportFilterBar
        branchId={branchId}
        onBranchChange={setBranchId}
        period={period}
        onPeriodChange={setPeriod}
        showPeriod
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar empleado o usuario…"
        showSearch
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas totales" value={formatDOP(report.totals.salesTotal)} icon={DollarSign} tone="brand" />
        <StatCard label="Citas atendidas" value={report.totals.appointmentsAttended} icon={Calendar} tone="emerald" />
        <StatCard label="Citas creadas" value={report.totals.appointmentsCreated} icon={Users} tone="amber" />
        <StatCard label="Transacciones" value={report.totals.transactions} icon={Target} tone="slate" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'relative px-6 py-3 text-sm font-medium transition-colors',
              tab === t.id ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />}
          </button>
        ))}
        </div>
        <Button variant="secondary" size="sm" onClick={exportDetailCsv} data-testid="personal-export-csv">
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {tab === 'usuarios' && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Ventas por usuario" subtitle="Total vendido en el período">
              {salesChart.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">Sin ventas en el período</p>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height={300} minWidth={0}>
                    <BarChart data={salesChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatDOP(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatDOP(v)} />
                      <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Citas creadas por usuario" subtitle="Registros de agenda en el período">
              {createdChart.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">Sin citas creadas en el período</p>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height={300} minWidth={0}>
                    <BarChart data={createdChart} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} width={32} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="font-heading text-base font-semibold text-slate-800">Detalle por usuario</h3>
            </div>
            <ResponsiveList columnCount={6}>
              <ResponsiveTable testId="report-personal-users" wrapCard={false}>
                <SortableTableProvider sortKey={userSortKey} sortDir={userSortDir} onSort={toggleUserSort}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <SortableTh column="name" className="px-4 py-3">Nombre</SortableTh>
                      <SortableTh column="role" className="px-4 py-3">Rol</SortableTh>
                      <SortableTh column="salesCount" align="center" className="px-4 py-3">Ventas (cant.)</SortableTh>
                      <SortableTh column="salesTotal" align="right" className="px-4 py-3">Total ventas</SortableTh>
                      <SortableTh column="appointmentsCreated" align="center" className="px-4 py-3">Citas creadas</SortableTh>
                      <SortableTh column="avgTicket" align="right" className="px-4 py-3">Ticket prom.</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {byUserRows.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Sin datos para los filtros seleccionados</td></tr>
                    ) : (
                      byUserRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                          <td className="px-4 py-3 text-xs capitalize text-slate-500">{row.role}</td>
                          <td className="px-4 py-3 text-center font-semibold text-emerald-600">{row.salesCount}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800">{formatDOP(row.salesTotal)}</td>
                          <td className="px-4 py-3 text-center font-semibold text-orange-600">{row.appointmentsCreated}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{formatDOP(row.avgTicket)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </SortableTableProvider>
              </ResponsiveTable>
              <ResponsiveCards testId="report-personal-users-cards" className="p-4">
                {byUserRows.map((row) => (
                  <MobileCard key={row.id} testId={`report-personal-user-card-${row.id}`}>
                    <MobileCardHeader title={row.name} subtitle={row.role} />
                    <MobileCardGrid>
                      <MobileField label="Ventas (cant.)">
                        <span className="font-semibold text-emerald-600">{row.salesCount}</span>
                      </MobileField>
                      <MobileField label="Total ventas">
                        <span className="font-bold text-slate-800">{formatDOP(row.salesTotal)}</span>
                      </MobileField>
                      <MobileField label="Citas creadas">
                        <span className="font-semibold text-orange-600">{row.appointmentsCreated}</span>
                      </MobileField>
                      <MobileField label="Ticket prom.">{formatDOP(row.avgTicket)}</MobileField>
                    </MobileCardGrid>
                  </MobileCard>
                ))}
              </ResponsiveCards>
            </ResponsiveList>
          </div>
        </>
      )}

      {tab === 'empleados' && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="font-heading text-base font-semibold text-slate-800">Prestación de servicios por empleado</h3>
            </div>
            <ResponsiveList columnCount={6}>
              <ResponsiveTable testId="report-personal-employees" wrapCard={false}>
                <SortableTableProvider sortKey={empSortKey} sortDir={empSortDir} onSort={toggleEmpSort}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <SortableTh column="name" className="px-4 py-3">Empleado</SortableTh>
                      <SortableTh column="position" className="px-4 py-3">Cargo</SortableTh>
                      <SortableTh column="appointmentsAttended" align="center" className="px-4 py-3">Citas atendidas</SortableTh>
                      <SortableTh column="noShows" align="center" className="px-4 py-3">No-shows</SortableTh>
                      <SortableTh column="revenue" align="right" className="px-4 py-3">Ingresos servicios</SortableTh>
                      <SortableTh column="avgTicket" align="right" className="px-4 py-3">Ticket prom.</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployeeRows.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Sin datos para los filtros seleccionados</td></tr>
                    ) : (
                      byEmployeeRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                          <td className="px-4 py-3 text-slate-600">{row.position}</td>
                          <td className="px-4 py-3 text-center font-semibold text-emerald-600">{row.appointmentsAttended}</td>
                          <td className="px-4 py-3 text-center font-semibold text-red-500">{row.noShows}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800">{formatDOP(row.revenue)}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{formatDOP(row.avgTicket)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </SortableTableProvider>
              </ResponsiveTable>
              <ResponsiveCards testId="report-personal-employees-cards" className="p-4">
                {byEmployeeRows.map((row) => (
                  <MobileCard key={row.id} testId={`report-personal-employee-card-${row.id}`}>
                    <MobileCardHeader title={row.name} subtitle={row.position} />
                    <MobileCardGrid>
                      <MobileField label="Citas atendidas">
                        <span className="font-semibold text-emerald-600">{row.appointmentsAttended}</span>
                      </MobileField>
                      <MobileField label="No-shows">
                        <span className="font-semibold text-red-500">{row.noShows}</span>
                      </MobileField>
                      <MobileField label="Ingresos">
                        <span className="font-bold text-slate-800">{formatDOP(row.revenue)}</span>
                      </MobileField>
                      <MobileField label="Ticket prom.">{formatDOP(row.avgTicket)}</MobileField>
                    </MobileCardGrid>
                  </MobileCard>
                ))}
              </ResponsiveCards>
            </ResponsiveList>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="font-heading text-base font-semibold text-slate-800">Uso de insumos por empleado</h3>
              <p className="text-xs text-slate-400">Salidas atribuidas vs citas atendidas (Fase 3)</p>
            </div>
            <ResponsiveList columnCount={5}>
              <ResponsiveTable testId="report-personal-supplies" wrapCard={false}>
                <SortableTableProvider sortKey={supplySortKey} sortDir={supplySortDir} onSort={toggleSupplySort}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <SortableTh column="employeeName" className="px-4 py-3">Empleado</SortableTh>
                      <SortableTh column="supplyName" className="px-4 py-3">Insumo</SortableTh>
                      <SortableTh column="qty" align="center" className="px-4 py-3">Cantidad</SortableTh>
                      <SortableTh column="appointmentsCount" align="center" className="px-4 py-3">Citas</SortableTh>
                      <SortableTh column="summary" className="px-4 py-3">Resumen</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {supplyRows.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Sin salidas de insumos registradas</td></tr>
                    ) : (
                      supplyRows.map((row) => (
                        <tr key={`${row.employeeId}-${row.supplyId}`} className="border-b border-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{row.employeeName}</td>
                          <td className="px-4 py-3 text-slate-600">{row.supplyName}</td>
                          <td className="px-4 py-3 text-center text-slate-700">{row.qty}</td>
                          <td className="px-4 py-3 text-center text-slate-700">{row.appointmentsCount}</td>
                          <td className="px-4 py-3 text-slate-500">{row.summary}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </SortableTableProvider>
              </ResponsiveTable>
              <ResponsiveCards testId="report-personal-supplies-cards" className="p-4">
                {supplyRows.map((row) => (
                  <MobileCard key={`${row.employeeId}-${row.supplyId}`} testId={`report-supply-card-${row.employeeId}-${row.supplyId}`}>
                    <MobileCardHeader title={row.employeeName} subtitle={row.supplyName} />
                    <MobileCardGrid>
                      <MobileField label="Cantidad">{row.qty}</MobileField>
                      <MobileField label="Citas">{row.appointmentsCount}</MobileField>
                      <MobileField label="Resumen" fullWidth>{row.summary}</MobileField>
                    </MobileCardGrid>
                  </MobileCard>
                ))}
              </ResponsiveCards>
            </ResponsiveList>
          </div>
        </>
      )}
    </div>
  )
}
