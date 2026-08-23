import { REPORT_PERIODS } from '../lib/reportes'
import { cn } from '@/lib/utils'

export function PeriodFilter({ period, onChange }) {
  return (
    <div className="flex items-center gap-1 self-start overflow-x-auto scrollbar-hide rounded-xl border border-slate-100 bg-white p-1 shadow-soft w-fit" data-testid="report-period-filter">
      {REPORT_PERIODS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          data-testid={`report-period-${f.id}`}
          className={cn(
            'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-[background-color,color] duration-200',
            period === f.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
