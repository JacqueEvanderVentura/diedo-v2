import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_STARS = 5
const STEP = 0.5

function starFill(value, index) {
  const threshold = index + 1
  if (value >= threshold) return 1
  if (value >= threshold - STEP) return 0.5
  return 0
}

export function LeadStarRating({
  value = null,
  onChange,
  disabled = false,
  size = 'md',
  className,
}) {
  const numeric = value == null || value === '' ? null : Number(value)
  const iconClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  const handleClick = (event, index) => {
    if (disabled || !onChange) return
    const rect = event.currentTarget.getBoundingClientRect()
    const half = event.clientX - rect.left < rect.width / 2
    const next = Math.min(MAX_STARS, index + (half ? STEP : 1))
    if (numeric != null && Math.abs(numeric - next) < 0.01) {
      onChange(null)
      return
    }
    onChange(next)
  }

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={MAX_STARS}
      aria-valuenow={numeric ?? undefined}
      aria-label={numeric != null ? `Calificación ${numeric} de 5` : 'Sin calificar'}
    >
      {Array.from({ length: MAX_STARS }, (_, index) => {
        const fill = numeric == null ? 0 : starFill(numeric, index)
        return (
          <button
            key={index}
            type="button"
            disabled={disabled}
            onClick={(event) => handleClick(event, index)}
            className={cn(
              'relative rounded p-0.5 transition-colors',
              disabled ? 'cursor-default opacity-60' : 'cursor-pointer hover:text-amber-500',
            )}
            aria-label={`${index + STEP} estrellas`}
          >
            <Star className={cn(iconClass, 'text-slate-200')} strokeWidth={1.5} />
            {fill > 0 && (
              <Star
                className={cn(
                  iconClass,
                  'absolute left-0.5 top-0.5 text-amber-400',
                  fill < 1 && 'clip-path-half',
                )}
                fill="currentColor"
                strokeWidth={0}
                style={fill < 1 ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
              />
            )}
          </button>
        )
      })}
      {numeric == null && (
        <span className="ml-1 text-xs text-slate-400">Sin calificar</span>
      )}
    </div>
  )
}

export function sortLeadsByStarRating(leads, direction = 'desc') {
  const dir = direction === 'asc' ? 1 : -1
  return [...leads].sort((left, right) => {
    const a = left.starRating
    const b = right.starRating
    const aMissing = a == null || a === ''
    const bMissing = b == null || b === ''
    if (aMissing && bMissing) return 0
    if (aMissing) return 1
    if (bMissing) return -1
    const diff = Number(a) - Number(b)
    if (diff !== 0) return diff * dir
    return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)
  })
}
