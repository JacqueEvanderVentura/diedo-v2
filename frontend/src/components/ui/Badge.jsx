import { cn } from '@/lib/utils'

const tones = {
  brand: 'bg-blue-50 text-blue-700',
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
}

export function Badge({ tone = 'brand', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
