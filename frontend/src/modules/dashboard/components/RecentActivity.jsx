import * as Icons from 'lucide-react'
import { Card } from '@/components/ui/Card'

export function RecentActivity({ activity }) {
  return (
    <Card className="p-6" data-testid="dashboard-activity">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-slate-800">
          Actividad Reciente
        </h3>
        <button
          data-testid="activity-history"
          className="text-sm font-semibold text-slate-400 transition-colors hover:text-slate-600"
        >
          Historial
        </button>
      </div>

      <ol className="relative space-y-1">
        {activity.map((item, i) => {
          const Icon = Icons[item.icon] || Icons.Activity
          const isLast = i === activity.length - 1
          return (
            <li key={item.id} className="relative flex gap-4 pb-5" data-testid={`activity-${item.id}`}>
              {!isLast && <span className="absolute left-[19px] top-11 h-full w-px bg-slate-100" />}
              <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-sm font-medium text-slate-800">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {item.time} · {item.source}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
