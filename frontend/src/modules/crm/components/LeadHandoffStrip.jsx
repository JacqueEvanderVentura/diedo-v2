import { useNavigate } from 'react-router-dom'
import { Briefcase, FileText, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buildLeadHandoffPaths } from '../lib/leadHandoff'

export function LeadHandoffStrip({ handoff, onDismiss }) {
  const navigate = useNavigate()
  if (!handoff) return null

  const paths = buildLeadHandoffPaths(handoff)
  const go = (path) => {
    if (!path) return
    onDismiss?.()
    navigate(path)
  }

  return (
    <div
      className="mt-4 flex flex-col gap-3 border-t border-emerald-100 pt-4"
      data-testid={`lead-handoff-${handoff.leadId}`}
    >
      <p className="text-sm font-medium text-emerald-900">¿Qué quieres hacer ahora?</p>
      <div className="flex flex-wrap gap-2">
        {paths.pipeline && (
          <Button type="button" size="sm" variant="secondary" onClick={() => go(paths.pipeline)}>
            <Briefcase className="h-3.5 w-3.5" /> Ver pipeline
          </Button>
        )}
        {paths.quote && (
          <Button type="button" size="sm" onClick={() => go(paths.quote)}>
            <FileText className="h-3.5 w-3.5" /> Cotizar
          </Button>
        )}
        {paths.customer && (
          <Button type="button" size="sm" variant="secondary" onClick={() => go(paths.customer)}>
            <User className="h-3.5 w-3.5" /> Ver cliente
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>Cerrar</Button>
      </div>
    </div>
  )
}
