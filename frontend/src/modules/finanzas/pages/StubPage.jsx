import { Link } from 'react-router-dom'
import { Construction, ArrowLeft } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'

export default function StubPage({ title, description }) {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-center p-6 sm:p-8" data-testid="finanzas-stub">
      <EmptyState
        icon={Construction}
        title={title || 'En construcción'}
        description={description || 'Esta sección estará disponible próximamente.'}
        className="py-16"
      />
      <Link
        to="/finanzas"
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 shadow-sm transition-colors hover:bg-slate-50'
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al Centro Financiero
      </Link>
    </div>
  )
}
