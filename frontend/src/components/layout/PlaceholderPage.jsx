import { Construction } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export default function PlaceholderPage({ path }) {
  return (
    <div className="p-8">
      <EmptyState
        icon={Construction}
        title="Módulo en construcción"
        description={`La ruta ${path} forma parte de una fase futura del roadmap Diedo.`}
      />
    </div>
  )
}
