import { cn } from '@/lib/utils'

export function DiedoIcon({ className, title = 'Diedo', ...props }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-9 w-9 shrink-0', className)}
      role="img"
      aria-label={title}
      {...props}
    >
      <circle cx="30" cy="18" r="6" fill="#3B82F6" />
      <rect x="24" y="30" width="12" height="40" rx="6" fill="#3B82F6" />
      <circle cx="30" cy="82" r="6" fill="#22D3EE" />
      <path d="M42 30H56A22 22 0 0 1 71.5 36.5" stroke="#A855F7" strokeWidth="12" strokeLinecap="round" />
      <path d="M42 70H56A22 22 0 0 0 71.5 63.5" stroke="#22D3EE" strokeWidth="12" strokeLinecap="round" />
      <circle cx="82" cy="50" r="6" fill="#A855F7" />
    </svg>
  )
}
