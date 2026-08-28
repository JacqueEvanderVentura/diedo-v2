import { useEffect, useState } from 'react'
import { formatTaskCountdown } from '../lib/countdown'
import { cn } from '@/lib/utils'

export function TaskCountdown({ dueAt, completed }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (completed) return undefined
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [completed])

  if (completed || !dueAt) return null

  const countdown = formatTaskCountdown(dueAt, now)
  if (!countdown) return null

  return (
    <p
      className={cn(
        'text-sm italic',
        countdown.tone === 'overdue' && 'font-medium text-red-600 not-italic',
        countdown.tone === 'upcoming' && 'text-slate-500',
        countdown.tone === 'now' && 'font-medium text-amber-600 not-italic'
      )}
      data-testid="task-countdown"
    >
      {countdown.text}
    </p>
  )
}
