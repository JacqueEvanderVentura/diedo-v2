import { useEffect, useState } from 'react'
import { ACTIVITY_TYPE_META } from '@/data/crm'
import { activityDueUrgencyClass, activityDueUrgencyTone } from '@/modules/crm/lib/countdown'

function formatWhen(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-DO')
}

export function TimelineActivityMeta({ activity, stageMove }) {
  const pendingDue = Boolean(activity?.dueAt && !activity?.completedAt && !stageMove)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!pendingDue) return undefined
    const ms = activityDueUrgencyTone(activity.dueAt, new Date()) === 'normal' ? 60_000 : 1_000
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [activity?.dueAt, pendingDue])

  const typeLabel = stageMove
    ? 'Movimiento de etapa'
    : (ACTIVITY_TYPE_META[activity?.type]?.label || activity?.type || 'Actividad')

  if (pendingDue) {
    const tone = activityDueUrgencyTone(activity.dueAt, now)
    return (
      <p className="text-xs">
        <span className="text-slate-500">{typeLabel} · </span>
        <span className={activityDueUrgencyClass(tone)} data-testid="timeline-activity-due">
          {formatWhen(activity.dueAt)}
        </span>
      </p>
    )
  }

  const when = activity?.completedAt || activity?.createdAt || activity?.dueAt
  return (
    <p className="text-xs text-slate-500">
      {typeLabel}
      {when ? ` · ${formatWhen(when)}` : ''}
    </p>
  )
}
