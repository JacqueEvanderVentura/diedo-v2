import { cn } from '@/lib/utils'

export function Switch({
  checked = false,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
  className,
  testId,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        'text-left transition-colors hover:bg-slate-50/80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-40',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-block h-6 w-11 rounded-full transition-colors duration-200',
          checked ? 'bg-blue-600' : 'bg-slate-200'
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-slate-900/10',
            'transition-transform duration-200 ease-out',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </span>
    </button>
  )
}
