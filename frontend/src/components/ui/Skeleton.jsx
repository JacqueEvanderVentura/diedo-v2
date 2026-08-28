import { cn } from '@/lib/utils'

export function Skeleton({ className }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-soft',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.5s_infinite] after:bg-gradient-to-r after:from-transparent after:via-slate-100 after:to-transparent',
        className
      )}
    />
  )
}
