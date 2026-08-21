import { SlidersHorizontal, CalendarClock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

export function AppointmentsToday({ appointments }) {
  return (
    <Card className="p-6" data-testid="dashboard-appointments">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-slate-800">
          Agenda: Citas de Hoy
        </h3>
        <button
          data-testid="appointments-filter"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtrar
        </button>
      </div>

      {appointments.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No hay citas pendientes hoy"
          description="Cuando agendes una cita para hoy, aparecerá aquí."
        />
      ) : (
        <div className="space-y-3">
          {appointments.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-100 p-4">
              {a.title}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
