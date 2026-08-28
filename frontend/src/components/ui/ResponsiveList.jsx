import { createContext, useContext, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

const ResponsiveListContext = createContext({
  tableClass: 'hidden md:block',
  cardsClass: 'grid gap-3 md:hidden',
  isWide: false,
})

/** Tables wider than ~880px or with 7+ columns stay as cards until 1100px. */
export function isWideTable({ minTableWidth = 0, columnCount = 0 } = {}) {
  return minTableWidth >= 880 || columnCount >= 7
}

/**
 * Responsive shell: cards below md (768px); table from md up.
 * Wide tables use cards between md and desk (1100px).
 */
export function ResponsiveList({
  children,
  className,
  wide,
  minTableWidth = 0,
  columnCount = 0,
}) {
  const isWide = wide ?? isWideTable({ minTableWidth, columnCount })
  const value = useMemo(
    () => ({
      isWide,
      tableClass: isWide ? 'hidden desk:block' : 'hidden md:block',
      cardsClass: isWide ? 'grid gap-3 desk:hidden' : 'grid gap-3 md:hidden',
    }),
    [isWide]
  )

  return (
    <ResponsiveListContext.Provider value={value}>
      <div className={className}>{children}</div>
    </ResponsiveListContext.Provider>
  )
}

export function ResponsiveTable({ children, className, testId, wrapCard = true }) {
  const { tableClass } = useContext(ResponsiveListContext)
  const inner = (
    <div className={cn('overflow-x-auto scrollbar-thin', className)} data-testid={testId}>
      {children}
    </div>
  )

  return (
    <div className={tableClass}>
      {wrapCard ? (
        <Card className="overflow-hidden" data-testid={testId ? `${testId}-wrap` : undefined}>
          {inner}
        </Card>
      ) : (
        inner
      )}
    </div>
  )
}

export function ResponsiveCards({ children, className, testId }) {
  const { cardsClass } = useContext(ResponsiveListContext)
  return (
    <div className={cn(cardsClass, className)} data-testid={testId}>
      {children}
    </div>
  )
}

export function MobileCard({ children, onClick, className, testId }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick(e)
              }
            }
          : undefined
      }
      data-testid={testId}
      className={cn(
        'rounded-xl border border-slate-100 bg-white p-4 shadow-soft',
        onClick && 'cursor-pointer transition-colors hover:bg-slate-50/80',
        className
      )}
    >
      {children}
    </div>
  )
}

export function MobileField({ label, children, className, fullWidth = false }) {
  return (
    <div className={cn(fullWidth ? 'col-span-2' : undefined, className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 text-sm text-slate-700">{children}</div>
    </div>
  )
}

export function MobileCardHeader({ title, subtitle, badge, actions }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{title}</p>
        {subtitle ? <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge}
        {actions}
      </div>
    </div>
  )
}

export function MobileCardFooter({ children, className }) {
  return <div className={cn('mt-3 flex items-center justify-between border-t border-slate-50 pt-3', className)}>{children}</div>
}

export function MobileCardGrid({ children, className }) {
  return <div className={cn('mt-3 grid grid-cols-2 gap-2', className)}>{children}</div>
}
