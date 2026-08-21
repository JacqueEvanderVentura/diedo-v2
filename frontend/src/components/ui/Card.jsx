import { cn } from '@/lib/utils'

export function Card({ className, interactive = false, children, ...props }) {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-slate-100 shadow-soft',
        interactive &&
          'hover:shadow-md hover:border-blue-100 transition-[box-shadow,border-color] duration-200 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('flex items-center justify-between p-6 pb-0', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3
      className={cn('font-heading text-lg font-semibold tracking-tight text-slate-800', className)}
      {...props}
    >
      {children}
    </h3>
  )
}
