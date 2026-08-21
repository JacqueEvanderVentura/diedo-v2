import { cn } from '@/lib/utils'

export function Skeleton({ className }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-slate-100',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.5s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent',
        className
      )}
    />
  )
}
