import {
  Ban,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  UserX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

function StatTile({ label, value, icon: Icon, tone = 'brand', sub, testId }) {
  const tones = {
    brand: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    slate: 'text-slate-600 bg-slate-100',
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

export function CalendarStatsBar({ stats }) {
  const scope = stats.rangeScopeLabel
  const tiles = [
    {
      key: 'total',
      label: 'Citas en rango',
      value: formatNumber(stats.total),
      icon: CalendarRange,
      tone: 'brand',
      sub: scope,
      testId: 'calendar-stat-total',
    },
    {
      key: 'pending',
      label: 'Pendientes',
      value: formatNumber(stats.pending),
      icon: CalendarClock,
      tone: 'brand',
      sub: 'Confirmadas',
      testId: 'calendar-stat-pending',
    },
    {
      key: 'completed',
      label: 'Cumplidas',
      value: formatNumber(stats.completed),
      icon: CalendarCheck,
      tone: 'emerald',
      testId: 'calendar-stat-completed',
    },
    {
      key: 'noshow',
      label: 'No-show',
      value: formatNumber(stats.noShow),
      icon: UserX,
      tone: 'red',
      testId: 'calendar-stat-noshow',
    },
    {
      key: 'cancelled',
      label: 'Canceladas',
      value: formatNumber(stats.cancelled),
      icon: Ban,
      tone: 'amber',
      testId: 'calendar-stat-cancelled',
    },
  ]

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
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
