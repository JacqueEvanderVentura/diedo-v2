import { parseMentionParts } from '@/lib/mentions'
import { cn } from '@/lib/utils'

export function MentionText({ text, className }) {
  const parts = parseMentionParts(text)

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.kind === 'text') return <span key={i}>{part.value}</span>
        if (part.kind === 'user') {
          return (
            <span
              key={i}
              className={cn('rounded px-1 py-0.5 font-semibold text-blue-700 bg-blue-50')}
              title="Usuario del sistema"
            >
              @{part.label}
            </span>
          )
        }
        if (part.kind === 'emp') {
          return (
            <span
              key={i}
              className={cn('rounded px-1 py-0.5 font-semibold text-amber-800 bg-amber-100')}
              title="Empleado del directorio"
            >
              @{part.label}
            </span>
          )
        }
        return null
      })}
    </span>
  )
}
