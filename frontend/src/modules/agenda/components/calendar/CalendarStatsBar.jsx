import { Calendar, CalendarDays, CalendarRange, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

function StatTile({ label, value, icon: Icon, tone = 'brand', sub, testId }) {
  const tones = {
    brand: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    slate: 'text-slate-600 bg-slate-100',
    violet: 'text-violet-600 bg-violet-50',
  }
  return (
    <div
      className="flex h-full min-w-0 items-start gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft"
      data-testid={testId}
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-slate-400">{label}</p>
        <p
          className="mt-0.5 break-words font-heading text-base font-bold leading-tight text-slate-800 sm:text-lg"
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {value}
        </p>
        {sub && <p className="mt-1 text-[11px] leading-snug text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

export function CalendarStatsBar({ stats, view }) {
  const tiles = [
    {
      key: 'month',
      show: true,
      label: 'Citas del mes',
      value: formatNumber(stats.monthCount),
      icon: CalendarRange,
      tone: 'brand',
      testId: 'calendar-stat-month',
    },
    {
      key: 'week',
      show: view === 'week',
      label: 'Citas de la semana',
      value: formatNumber(stats.weekCount),
      icon: CalendarDays,
      tone: 'violet',
      testId: 'calendar-stat-week',
    },
    {
      key: 'day',
      show: view === 'day',
      label: 'Citas del día',
      value: formatNumber(stats.dayCount),
      icon: Calendar,
      tone: 'emerald',
      testId: 'calendar-stat-day',
    },
    {
      key: 'average',
      show: view === 'week' || view === 'month',
      label: 'Promedio / día',
      value: formatNumber(stats.averagePerDay),
      icon: TrendingUp,
      tone: 'slate',
      sub: view === 'week' ? 'En la semana visible' : `En ${stats.rangeDays} días del mes`,
      testId: 'calendar-stat-average',
    },
  ].filter((t) => t.show)

  if (tiles.length === 0) return null

  return (
    <div
      className={cn(
        'grid gap-3',
        tiles.length === 1 && 'grid-cols-1 sm:grid-cols-1',
        tiles.length === 2 && 'grid-cols-1 sm:grid-cols-2',
        tiles.length === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        tiles.length >= 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
      )}
      data-testid="calendar-stats-bar"
    >
      {tiles.map((tile) => (
        <StatTile
          key={tile.key}
          label={tile.label}
          value={tile.value}
          icon={tile.icon}
          tone={tile.tone}
          sub={tile.sub}
          testId={tile.testId}
        />
      ))}
    </div>
  )
}
