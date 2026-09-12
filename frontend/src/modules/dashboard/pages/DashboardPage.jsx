import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { DatePeriodFilter } from '@/components/ui/DatePeriodFilter'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { periodFilterLabel } from '@/lib/datePeriod'
import { DASHBOARD_FILTERS } from '@/data/dashboard'
import { KpiCard } from '../components/KpiCard'
import { SalesChart } from '../components/SalesChart'
import { StockAlerts } from '../components/StockAlerts'
import { AppointmentsToday } from '../components/AppointmentsToday'
import { RecentActivity } from '../components/RecentActivity'
import { Skeleton } from '@/components/ui/Skeleton'

const REVENUE_LABELS = {
  today: 'Ingresos Hoy',
  week: 'Ingresos Semana',
  month: 'Ingresos Mes',
  quarter: 'Ingresos Trimestre',
  custom: 'Ingresos del período',
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
  const dateFrom = useDashboardStore((state) => state.dateFrom)
  const dateTo = useDashboardStore((state) => state.dateTo)
  const branchIds = useDashboardStore((state) => state.branchIds)
  const setPeriodFilter = useDashboardStore((state) => state.setPeriodFilter)
  const setBranchIds = useDashboardStore((state) => state.setBranchIds)
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
    hydrate({ period, dateFrom, dateTo, branchIds }).catch(() => {})
  }, [branchIds, dateFrom, dateTo, hydrate, period])

  const revenueLabel =
    period === 'custom'
      ? periodFilterLabel({ period, dateFrom, dateTo }, DASHBOARD_FILTERS)
      : REVENUE_LABELS[period] || 'Ingresos'

  const kpis = [
    {
      id: 'ingresos',
      label: revenueLabel,
      value: summary.revenue,
      kind: 'currency',
      tag: 'Actualización en vivo',
      icon: 'DollarSign',
      tone: 'brand',
    },
    {
      id: 'leads',
      label: 'Leads Activos',
      value: summary.activeLeads,
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
        <div className="flex w-full flex-col items-stretch gap-3 self-start sm:max-w-xl sm:items-end">
          <BranchMultiSelect
            branches={branches}
            branchIds={branchIds}
            onChange={setBranchIds}
            testId="dashboard-branch-filter"
          />
          <DatePeriodFilter
            period={period}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={setPeriodFilter}
            periods={DASHBOARD_FILTERS}
            testId="dashboard-period-filter"
          />
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
