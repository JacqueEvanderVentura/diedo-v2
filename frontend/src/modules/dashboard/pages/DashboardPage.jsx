import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useCatalogStore, deriveLowStock } from '@/stores/catalogStore'
import { useAgendaStore, todayKey } from '@/stores/agendaStore'
import { usePosStore } from '@/stores/posStore'
import { useConfigStore } from '@/stores/configStore'
import { DASHBOARD_FILTERS, KPIS, SALES_TREND } from '@/data/dashboard'
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

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function DashboardPage() {
  const sessionUser = useSessionStore((s) => s.user)
  const period = useDashboardStore((s) => s.period)
  const branchId = useDashboardStore((s) => s.branchId)
  const setPeriod = useDashboardStore((s) => s.setPeriod)
  const setBranchId = useDashboardStore((s) => s.setBranchId)
  const activity = useDashboardStore((s) => s.activity)
  const branches = useConfigStore((s) => s.branches)
  const sales = usePosStore((s) => s.sales)
  const catalogProducts = useCatalogStore((s) => s.products)
  const appointments = useAgendaStore((s) => s.appointments)
  const todayCount = useMemo(
    () =>
      appointments.filter(
        (a) => a.date === todayKey() && (branchId === 'all' || a.branchId === branchId)
      ).length,
    [appointments, branchId]
  )
  const stockAlerts = useMemo(() => {
    const alerts = deriveLowStock(catalogProducts)
    if (branchId === 'all') return alerts
    return alerts.filter((a) => {
      const product = catalogProducts.find((p) => p.id === a.id || p.name === a.name)
      return product?.branchId === branchId || product?.branchIds?.includes(branchId)
    })
  }, [catalogProducts, branchId])
  const [loading, setLoading] = useState(false)
  const firstRun = useRef(true)

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setLoading(true)
    const t = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(t)
  }, [period, branchId])

  const kpis = KPIS[period] || KPIS.week
  const branchSalesTotal = useMemo(() => {
    if (branchId === 'all') return null
    const now = Date.now()
    const days = { today: 1, week: 7, month: 30, quarter: 90 }[period] || 7
    const start = now - days * 86400000
    return sales
      .filter((s) => s.branchId === branchId && new Date(s.createdAt).getTime() >= start)
      .reduce((sum, s) => sum + (s.total || 0), 0)
  }, [sales, branchId, period])

  const liveKpis = kpis.map((k) => {
    if (k.id === 'personal') {
      return { id: 'citas', label: 'Citas Hoy', value: todayCount, kind: 'number', tag: 'Agenda del día', icon: 'CalendarClock', tone: 'violet' }
    }
    if (k.id === 'ingresos' && branchSalesTotal != null) {
      return { ...k, value: branchSalesTotal, tag: 'Filtrado por sucursal' }
    }
    return k
  })
  const trend = SALES_TREND[period] || SALES_TREND.week

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6 sm:p-8">
      {/* Header + persistent filter */}
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
          {DASHBOARD_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setPeriod(f.id)}
              data-testid={`dashboard-filter-${f.id}`}
              className={cn(
                'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-[background-color,color] duration-200',
                period === f.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              {f.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[168px]" />)
          : liveKpis.map((kpi, i) => <KpiCard key={kpi.id} kpi={kpi} index={i} />)}
      </div>

      {/* Chart + stock alerts */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? <Skeleton className="h-[400px]" /> : <SalesChart trend={trend} />}
        </div>
        <div>
          {loading ? <Skeleton className="h-[400px]" /> : <StockAlerts alerts={stockAlerts} />}
        </div>
      </div>

      {/* Appointments + activity */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
      >
        <AppointmentsToday branchId={branchId} />
        <RecentActivity activity={activity} />
      </motion.div>
    </div>
  )
}
