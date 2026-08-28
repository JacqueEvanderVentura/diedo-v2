import { cn } from '@/lib/utils'

/** Vertical enter via CSS for tab / panel switches. */
export function AnimatedTabPanel({ panelKey, children, className }) {
  return (
    <div key={panelKey} className={cn('w-full max-w-full animate-tab-enter', className)}>
      {children}
    </div>
  )
}
