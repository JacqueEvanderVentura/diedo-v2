import { Construction } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export function FeatureUnavailablePage({ title = 'Función próximamente' }) {
  return (
    <div className="mx-auto w-full max-w-3xl p-8" data-testid="feature-unavailable">
      <EmptyState
        icon={Construction}
        title={title}
        description="Esta función está desactivada hasta completar su integración con el backend y sus controles de producción."
      />
    </div>
  )
}
