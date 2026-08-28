import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronRight,
  FileText,
  TrendingUp,
  LifeBuoy,
} from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useIncidenciasStore } from '@/stores/incidenciasStore'
import { priorityMeta, statusMeta } from '@/data/incidencias'
import { fullName, initials, fmtDateShort } from '../lib/rrhh'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

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
  { title: 'Nómina', to: '/rrhh/nomina', icon: FileText, tone: 'emerald' },
  { title: 'Performance', to: '/rrhh/performance', icon: TrendingUp, tone: 'cyan' },
  { title: 'Incidencias', to: '/incidencias', icon: LifeBuoy, tone: 'danger' },
]

export default function RrhhOverviewPage() {
  const employees = useRrhhStore((s) => s.employees)
  const vacationRequests = useRrhhStore((s) => s.vacationRequests)
  const getOverviewStats = useRrhhStore((s) => s.getOverviewStats)
  const incidencias = useIncidenciasStore((s) => s.incidencias)
  const getStats = useIncidenciasStore((s) => s.getStats)

  const rrhhStats = useMemo(() => getOverviewStats(), [employees, vacationRequests, getOverviewStats])
  const incStats = useMemo(() => getStats(), [incidencias, getStats])

  const recentEmployees = useMemo(() => employees.filter((e) => e.active).slice(0, 5), [employees])
  const recentRequests = useMemo(() => vacationRequests.slice(0, 3), [vacationRequests])
  const recentIncidencias = useMemo(
    () => [...incidencias].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3),
    [incidencias]
  )

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="rrhh-overview">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Empleados" value={rrhhStats.totalEmployees} icon={Users} tone="brand" />
        <KpiCard label="Ausencias / Vacaciones" sublabel="Solicitudes aprobadas" value={rrhhStats.approvedVacations} icon={Calendar} tone="warning" />
        <KpiCard label="Aprobaciones Pendientes" sublabel="Requieren atención" value={rrhhStats.pendingApprovals} icon={Clock} tone="info" />
        <KpiCard label="Incidencias Activas" sublabel={`Críticas: ${incStats.criticas}`} value={incStats.abiertas + incStats.enProceso} icon={AlertTriangle} tone="danger" />
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 pr-2">Empleado</th>
                  <th className="hidden py-3 pr-2 md:table-cell">Puesto</th>
                  <th className="hidden py-3 pr-2 lg:table-cell">Departamento</th>
                  <th className="py-3">Estado</th>
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
          </div>
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
            <h3 className="font-heading font-semibold text-slate-900">Incidencias / Reportes</h3>
            <Badge tone="danger">{incStats.abiertas + incStats.enProceso} ACTIVAS</Badge>
          </div>
          <Link to="/incidencias" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <FileText className="h-4 w-4" /> Ver Todas
          </Link>
        </div>
        <div className="space-y-3">
          {recentIncidencias.map((inc) => {
            const pMeta = priorityMeta(inc.priority)
            const sMeta = statusMeta(inc.status)
            return (
              <div key={inc.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-slate-50 p-4">
                <div className="flex items-center gap-4">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', pMeta.tone === 'alta' ? 'bg-red-50' : 'bg-amber-50')}>
                    <AlertTriangle className={cn('h-5 w-5', pMeta.tone === 'alta' ? 'text-red-600' : 'text-amber-600')} />
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-400">Código</p>
                    <p className="font-medium text-slate-900">{inc.code}</p>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs uppercase text-slate-400">Fecha</p>
                  <p className="text-sm text-slate-700">{fmtDateShort(inc.createdAt)}</p>
                </div>
                <div className="hidden md:block">
                  <p className="text-xs uppercase text-slate-400">Prioridad</p>
                  <p className={cn('text-sm font-medium', pMeta.tone === 'alta' ? 'text-red-600' : 'text-amber-600')}>{pMeta.label}</p>
                </div>
                <Badge tone="neutral">{sMeta.label}</Badge>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon
          const tones = { brand: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', cyan: 'bg-cyan-50 text-cyan-600', danger: 'bg-red-50 text-red-600' }
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
