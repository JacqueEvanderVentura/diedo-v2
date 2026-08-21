import { cn } from '@/lib/utils'

export function EmptyState({ icon: Icon, title, description, action, className, ...props }) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
      {...props}
    >
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300 ring-1 ring-slate-100">
          <Icon className="h-6 w-6" strokeWidth={1.5} />
        </div>
      )}
      <p className="font-heading text-base font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
