import { cn } from '@/lib/utils'

/** Vertical enter via CSS — animation on inner shell so outer box stays layout-stable. */
export function ViewTransition({ transitionKey, children, className }) {
  return (
    <div key={transitionKey} className={cn('w-full max-w-full', className)}>
      <div className="animate-view-enter w-full max-w-full">{children}</div>
    </div>
  )
}
