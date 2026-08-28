import { MODULE_LABELS } from '@/data/crm'
import { TOP_MODULES_DISPLAY } from '@/modules/crm/lib/scoring'
import { cn } from '@/lib/utils'

export function ModuleFitBars({ moduleFits, compact = false, limit }) {
  if (!moduleFits) return null
  const showCount = limit ?? (compact ? TOP_MODULES_DISPLAY : 7)
  const entries = Object.entries(moduleFits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, showCount)

  return (
    <div className={cn('space-y-1.5', compact && 'space-y-1')}>
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <span className={cn('w-20 shrink-0 text-slate-500', compact ? 'text-[10px]' : 'text-xs')}>{MODULE_LABELS[key]}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${value}%` }} />
          </div>
          <span className={cn('w-8 text-right font-medium text-slate-600', compact ? 'text-[10px]' : 'text-xs')}>{value}%</span>
        </div>
      ))}
    </div>
  )
}

export function ScoreBadge({ score }) {
  const tone =
    score >= 75 ? 'bg-emerald-50 text-emerald-700' : score >= 50 ? 'bg-blue-50 text-blue-700' : score >= 30 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
  return <span className={cn('inline-flex rounded-lg px-2 py-0.5 text-xs font-bold', tone)}>{score}</span>
}
