import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { CalendarClock, Clock, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAgendaStore, statusMeta, todayKey } from '@/stores/agendaStore'

export function AppointmentsToday({ branchId = 'all' }) {
  const navigate = useNavigate()
  const appointments = useAgendaStore((s) => s.appointments)
  const today = useMemo(
    () =>
      appointments
        .filter((a) => a.date === todayKey())
        .filter((a) => branchId === 'all' || a.branchId === branchId)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, branchId]
  )

  return (
    <Card className="p-6" data-testid="dashboard-appointments">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-slate-800">
          Agenda: Citas de Hoy
        </h3>
        <button
          onClick={() => navigate('/agenda/calendario')}
          data-testid="appointments-goto-agenda"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          Ver agenda
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {today.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No hay citas para hoy"
          description="Cuando agendes una cita para hoy, aparecerá aquí."
        />
      ) : (
        <div className="space-y-3" data-testid="dashboard-appointments-list">
          {today.map((a) => {
            const st = statusMeta(a.status)
            return (
              <div key={a.id} className="flex items-center gap-4 rounded-xl border border-slate-100 p-4" data-testid={`dashboard-appointment-${a.id}`}>
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-800">{a.customerName}</p>
                  <p className="truncate text-xs text-slate-400">{a.time} · {a.serviceName || 'Sin servicio'}</p>
                </div>
                <Badge tone={st.tone}>{st.name}</Badge>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
