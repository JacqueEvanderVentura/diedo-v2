import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useConfigStore } from '@/stores/configStore'
import { DASHBOARD_FILTERS, LEADS_BY_PERIOD } from '@/data/dashboard'
import { useSessionStore } from '@/stores/sessionStore'
import { buildBranchFilterOptions } from '@/lib/branches'
import { Select } from '@/components/ui/Select'
import { KpiCard } from '../components/KpiCard'
import { SalesChart } from '../components/SalesChart'
import { StockAlerts } from '../components/StockAlerts'
import { AppointmentsToday } from '../components/AppointmentsToday'
import { RecentActivity } from '../components/RecentActivity'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

const REVENUE_LABELS = {
  today: 'Ingresos Hoy',
  week: 'Ingresos Semana',
  month: 'Ingresos Mes',
  quarter: 'Ingresos Trimestre',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function DashboardPage() {
  const sessionUser = useSessionStore((state) => state.user)
  const period = useDashboardStore((state) => state.period)
  const branchId = useDashboardStore((state) => state.branchId)
  const setPeriod = useDashboardStore((state) => state.setPeriod)
  const setBranchId = useDashboardStore((state) => state.setBranchId)
  const hydrate = useDashboardStore((state) => state.hydrate)
  const summary = useDashboardStore((state) => state.summary)
  const trend = useDashboardStore((state) => state.trend)
  const stockAlerts = useDashboardStore((state) => state.stockAlerts)
  const appointments = useDashboardStore((state) => state.appointments)
  const activity = useDashboardStore((state) => state.activity)
  const loading = useDashboardStore((state) => state.loading)
  const error = useDashboardStore((state) => state.error)
  const branches = useConfigStore((state) => state.branches)

  useEffect(() => {
    hydrate({ period, branchId }).catch(() => {})
  }, [branchId, hydrate, period])

  useEffect(() => {
    if (branchId === 'all' || branches.some((branch) => branch.id === branchId)) return
    setBranchId('all')
  }, [branchId, branches, setBranchId])

  const kpis = [
    {
      id: 'ingresos',
      label: REVENUE_LABELS[period],
      value: summary.revenue,
      kind: 'currency',
      tag: 'Actualización en vivo',
      icon: 'DollarSign',
      tone: 'brand',
    },
    {
      id: 'leads',
      label: 'Leads Activos',
      value: LEADS_BY_PERIOD[period],
      kind: 'number',
      tag: 'Oportunidades en progreso',
      icon: 'UserPlus',
      tone: 'sky',
    },
    {
      id: 'citas',
      label: 'Citas Hoy',
      value: summary.appointmentsToday,
      kind: 'number',
      tag: 'Agenda del día',
      icon: 'CalendarClock',
      tone: 'violet',
    },
    {
      id: 'tareas',
      label: 'Tareas Abiertas',
      value: summary.openTasks,
      kind: 'number',
      tag: 'Pendientes',
      icon: 'ClipboardList',
      tone: 'amber',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6 sm:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {greeting()}, {sessionUser?.name || 'Usuario'}
          </h2>
          <p className="mt-1 text-sm text-slate-400 sm:text-base">
            Este es el resumen de tu empresa en tiempo real.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 self-start sm:items-end">
          <Select
            value={branchId}
            onChange={setBranchId}
            options={buildBranchFilterOptions(branches)}
            className="min-w-[200px]"
            data-testid="dashboard-branch-filter"
          />
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide rounded-xl border border-slate-100 bg-white p-1 shadow-soft">
            {DASHBOARD_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setPeriod(filter.id)}
                data-testid={`dashboard-filter-${filter.id}`}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-[background-color,color] duration-200',
                  period === filter.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
          role="status"
        >
          No fue posible actualizar el resumen. Verifica la conexión e inténtalo nuevamente.
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[168px]" />
            ))
          : kpis.map((kpi, index) => <KpiCard key={kpi.id} kpi={kpi} index={index} />)}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? <Skeleton className="h-[400px]" /> : <SalesChart trend={trend} />}
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-[400px]" />
          ) : (
            <StockAlerts alerts={stockAlerts} />
          )}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
      >
        <AppointmentsToday appointments={appointments} />
        <RecentActivity activity={activity} />
      </motion.div>
    </div>
  )
}
