import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useDashboardStore } from '@/stores/dashboardStore'
import { DASHBOARD_FILTERS, CURRENT_USER } from '@/data/dashboard'
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
  const { period, setPeriod, getKpis, getSalesTrend, stockAlerts, activity, appointments } =
    useDashboardStore()
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
  }, [period])

  const kpis = getKpis()
  const trend = getSalesTrend()

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6 sm:p-8">
      {/* Header + persistent filter */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {greeting()}, {CURRENT_USER.name}
          </h2>
          <p className="mt-1 text-sm text-slate-400 sm:text-base">
            Este es el resumen de tu empresa en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-1 self-start overflow-x-auto scrollbar-hide rounded-xl border border-slate-100 bg-white p-1 shadow-soft">
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

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[168px]" />)
          : kpis.map((kpi, i) => <KpiCard key={kpi.id} kpi={kpi} index={i} />)}
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
        <AppointmentsToday appointments={appointments} />
        <RecentActivity activity={activity} />
      </motion.div>
    </div>
  )
}
