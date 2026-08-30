import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Calendar,
  Clock,
  DollarSign,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { fullName, initials } from '../lib/rrhh'
import { getEmployeeBranchIds } from '../lib/staff'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
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
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { formatDOP } from '@/lib/format'
import { DataSourceNotice } from '@/components/ui/DataSourceNotice'

function KpiCard({ label, sublabel, value, icon: Icon, tone }) {
  const tones = {
    brand: 'bg-blue-50 text-blue-600',
    warning: 'bg-amber-50 text-amber-600',
    info: 'bg-cyan-50 text-cyan-600',
    danger: 'bg-red-50 text-red-600',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        {sublabel && <span className="text-xs text-slate-400">{sublabel}</span>}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  )
}

const QUICK_LINKS = [
  { title: 'Directorio', to: '/rrhh/directorio', icon: Users, tone: 'brand' },
  { title: 'Solicitudes', to: '/rrhh/solicitudes', icon: Calendar, tone: 'cyan' },
  { title: 'Ctas. por cobrar', to: '/rrhh/cuentas-por-cobrar', icon: DollarSign, tone: 'emerald' },
  { title: 'Documentos', to: '/rrhh/documentos', icon: FileText, tone: 'brand' },
]

export default function RrhhOverviewPage() {
  const employees = useRrhhStore((s) => s.employees)
  const vacationRequests = useRrhhStore((s) => s.vacationRequests)
  const getOverviewStats = useRrhhStore((s) => s.getOverviewStats)
  const getDebtStats = useRrhhStore((s) => s.getDebtStats)
  const hrOverview = useRrhhStore((s) => s.hrOverview)
  const overviewDataState = useRrhhStore((s) => s.overviewDataState)
  const hydrateOverview = useRrhhStore((s) => s.hydrateOverview)

  const [employeeSearch, setEmployeeSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  useEffect(() => {
    hydrateOverview({ force: true }).catch(() => {})
  }, [hydrateOverview])

  const rrhhStats = useMemo(() => getOverviewStats(), [employees, vacationRequests, getOverviewStats])
  const debtStats = useMemo(() => hrOverview?.debt || getDebtStats(), [getDebtStats, hrOverview])

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees])

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase()
    return activeEmployees.filter((e) => {
      if (branchFilter !== 'all' && !getEmployeeBranchIds(e).includes(branchFilter)) return false
      if (!q) return true
      return fullName(e).toLowerCase().includes(q) || e.position?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q)
    })
  }, [activeEmployees, employeeSearch, branchFilter])

  const { rows: recentEmployees, sortKey, sortDir, toggleSort } = useSortedRows(filteredEmployees, {
    defaultSort: { key: 'employee', dir: 'asc' },
    accessors: {
      employee: (e) => fullName(e),
      position: (e) => e.position || '',
      department: (e) => e.department || '',
      status: (e) => e.active ? 1 : 0,
    },
  })

  const recentRequests = useMemo(
    () => (hrOverview?.recentRequests || vacationRequests).slice(0, 3),
    [hrOverview, vacationRequests]
  )

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="rrhh-overview">
      <DataSourceNotice state={overviewDataState} onRetry={() => hydrateOverview({ force: true })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Empleados" value={rrhhStats.totalEmployees} icon={Users} tone="brand" />
        <KpiCard label="Ausencias / Vacaciones" sublabel="Solicitudes aprobadas" value={rrhhStats.approvedVacations} icon={Calendar} tone="warning" />
        <KpiCard label="Aprobaciones Pendientes" sublabel="Requieren atención" value={rrhhStats.pendingApprovals} icon={Clock} tone="info" />
        <KpiCard label="Deuda pendiente" sublabel={`${debtStats.employeesWithDebt} empleados`} value={formatDOP(debtStats.pending)} icon={DollarSign} tone="danger" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-heading font-semibold text-slate-900">Directorio de Empleados</h3>
              <p className="text-sm text-slate-500">Estado actual de tu equipo de trabajo</p>
            </div>
            <Link to="/rrhh/directorio" className="text-sm font-medium text-blue-600 hover:underline">Ver Todos</Link>
          </div>
          <DataFilterBar
            search={employeeSearch}
            onSearchChange={setEmployeeSearch}
            searchPlaceholder="Buscar empleado..."
            showBranch
            branchId={branchFilter}
            onBranchChange={setBranchFilter}
            testId="rrhh-overview-employee-filters"
            className="mb-4 border-0 shadow-none p-0"
          />
          <ResponsiveList columnCount={4}>
            <ResponsiveTable testId="rrhh-overview-employees" wrapCard={false}>
              <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <SortableTh column="employee" className="py-3 pr-2">Empleado</SortableTh>
                    <SortableTh column="position" className="hidden py-3 pr-2 md:table-cell">Puesto</SortableTh>
                    <SortableTh column="department" className="hidden py-3 pr-2 lg:table-cell">Departamento</SortableTh>
                    <SortableTh column="status" className="py-3">Estado</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {recentEmployees.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{initials(e)}</div>
                          <div>
                            <p className="font-medium text-slate-800">{fullName(e)}</p>
                            <p className="text-xs text-slate-400">ID: {e.id.slice(-8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden py-3 text-slate-600 md:table-cell">{e.position || '—'}</td>
                      <td className="hidden py-3 text-slate-600 lg:table-cell">{e.department || '—'}</td>
                      <td className="py-3">
                        <Badge tone={e.active ? 'warning' : 'neutral'}>{e.active ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </SortableTableProvider>
            </ResponsiveTable>
            <ResponsiveCards testId="rrhh-overview-employees-cards">
              {recentEmployees.map((e) => (
                <MobileCard key={e.id} testId={`rrhh-overview-employee-card-${e.id}`}>
                  <MobileCardHeader
                    title={fullName(e)}
                    subtitle={`ID: ${e.id.slice(-8)}`}
                    badge={<Badge tone={e.active ? 'warning' : 'neutral'}>{e.active ? 'Activo' : 'Inactivo'}</Badge>}
                  />
                  <MobileCardGrid>
                    <MobileField label="Puesto">{e.position || '—'}</MobileField>
                    <MobileField label="Departamento">{e.department || '—'}</MobileField>
                  </MobileCardGrid>
                </MobileCard>
              ))}
            </ResponsiveCards>
          </ResponsiveList>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading font-semibold text-slate-900">Solicitudes Recientes</h3>
            <Link to="/rrhh/solicitudes" className="rounded-lg p-1.5 hover:bg-slate-50"><Clock className="h-4 w-4 text-slate-400" /></Link>
          </div>
          {recentRequests.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No hay solicitudes registradas.</p>
          ) : (
            <div className="space-y-3">
              {recentRequests.map((r) => {
                const emp = employees.find((e) => e.id === r.employeeId)
                return (
                  <div key={r.id} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-800">{fullName(emp)}</p>
                    <p className="text-xs text-slate-500">{r.startDate} — {r.endDate}</p>
                    <Badge tone={r.status === 'aprobada' ? 'success' : r.status === 'pendiente' ? 'warning' : 'neutral'} className="mt-1">
                      {r.status}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-heading font-semibold text-slate-900">Cuentas por cobrar</h3>
            <Badge tone={debtStats.pending > 0 ? 'warning' : 'success'}>{debtStats.employeesWithDebt} EMPLEADOS</Badge>
          </div>
          <Link to="/rrhh/cuentas-por-cobrar" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <DollarSign className="h-4 w-4" /> Ver detalle
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Total deuda</p>
            <p className="mt-1 font-heading text-lg font-bold text-slate-900">{formatDOP(debtStats.totalDebt)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Pagado</p>
            <p className="mt-1 font-heading text-lg font-bold text-emerald-600">{formatDOP(debtStats.totalPaid)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Pendiente</p>
            <p className="mt-1 font-heading text-lg font-bold text-amber-600">{formatDOP(debtStats.pending)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Empleados con deuda</p>
            <p className="mt-1 font-heading text-lg font-bold text-slate-900">{debtStats.employeesWithDebt}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon
          const tones = { brand: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', cyan: 'bg-cyan-50 text-cyan-600' }
          return (
            <Link key={link.to} to={link.to}>
              <Card className="flex items-center justify-between p-4 transition-colors hover:border-blue-200">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tones[link.tone])}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-slate-800">{link.title}</span>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
