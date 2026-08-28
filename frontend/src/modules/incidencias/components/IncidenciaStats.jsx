import { AlertTriangle, Clock, LifeBuoy, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const FILTERS = [
  { id: 'all', label: 'Total', statKey: 'total', icon: LifeBuoy, accent: 'slate' },
  { id: 'abierta', label: 'Abiertas', statKey: 'abiertas', icon: Zap, accent: 'purple' },
  { id: 'en_proceso', label: 'En Proceso', statKey: 'enProceso', icon: Clock, accent: 'blue' },
  { id: 'critica', label: 'Críticas', statKey: 'criticas', icon: AlertTriangle, accent: 'red' },
]

const STYLES = {
  slate: {
    icon: 'bg-slate-100 text-slate-600',
    active: 'border-slate-400 bg-gradient-to-br from-white to-slate-50 shadow-md ring-2 ring-slate-200',
  },
  purple: {
    icon: 'bg-purple-100 text-purple-600',
    active: 'border-purple-400 bg-gradient-to-br from-white to-purple-50 shadow-md ring-2 ring-purple-200',
  },
  blue: {
    icon: 'bg-blue-100 text-blue-600',
    active: 'border-blue-400 bg-gradient-to-br from-white to-blue-50 shadow-md ring-2 ring-blue-200',
  },
  red: {
    icon: 'bg-red-100 text-red-600',
    active: 'border-red-400 bg-gradient-to-br from-white to-red-50 shadow-md ring-2 ring-red-200',
  },
}

function StatCard({ filter, stats, activeFilter, onFilter }) {
  const { id, label, statKey, icon: Icon, accent } = filter
  const style = STYLES[accent]
  const isActive = activeFilter === id
  const isDimmed = activeFilter !== 'all' && !isActive

  return (
    <button
      type="button"
      onClick={() => onFilter(isActive && id !== 'all' ? 'all' : id)}
      data-testid={`incidencias-stat-${id}`}
      className={cn(
        'flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-200 hover:scale-110',
        isActive ? style.active : 'border-slate-100 bg-white shadow-soft hover:border-slate-200 hover:shadow-md',
        isDimmed && 'pointer-events-auto opacity-40 grayscale'
      )}
    >
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', style.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="font-heading text-2xl font-bold text-slate-900">{stats[statKey]}</p>
      </div>
    </button>
  )
}

export function IncidenciaStats({ stats, activeFilter, onFilter }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="incidencias-stats">
      {FILTERS.map((f) => (
        <StatCard key={f.id} filter={f} stats={stats} activeFilter={activeFilter} onFilter={onFilter} />
      ))}
    </div>
  )
}
