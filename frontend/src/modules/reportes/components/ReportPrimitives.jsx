import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'

export function StatCard({ label, value, icon: Icon, tone = 'brand', sub, testId }) {
  const tones = {
    brand: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    slate: 'text-slate-600 bg-slate-100',
    violet: 'text-violet-600 bg-violet-50',
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft" data-testid={testId}>
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="truncate font-heading text-lg font-bold text-slate-800" data-testid={testId ? `${testId}-value` : undefined}>{value}</p>
        {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

export function ChartCard({ title, subtitle, children, testId }) {
  return (
    <Card className="p-6" data-testid={testId}>
      <div className="mb-4">
        <h3 className="font-heading text-base font-semibold tracking-tight text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </Card>
  )
}
