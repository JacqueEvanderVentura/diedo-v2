import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Clock, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAgendaStore, todayKey } from '@/stores/agendaStore'
import { useConfigStore } from '@/stores/configStore'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { AppointmentFormModal } from '../components/AppointmentFormModal'
import { WeekView } from '../components/calendar/WeekView'
import { DayView } from '../components/calendar/DayView'
import { MonthView } from '../components/calendar/MonthView'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import {
  addDaysKey,
  addMonthsKey,
  formatLongDate,
  formatMonthYear,
  fromKey,
} from '../lib/calendar'
import { cn } from '@/lib/utils'

const VIEWS = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
]

export default function CalendarioPage() {
  const appointments = useAgendaStore((s) => s.appointments)
  const branches = useConfigStore((s) => s.branches)
  const [branchId, setBranchId] = useState(branches[0]?.id || '')
  const [view, setView] = useState('week')
  const [cursor, setCursor] = useState(todayKey())
  const [showCancelled, setShowCancelled] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [defaults, setDefaults] = useState({})

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return appointments.filter((a) => {
      if (!showCancelled && a.status === 'cancelada') return false
      if (!q) return true
      return a.customerName.toLowerCase().includes(q) || (a.serviceName || '').toLowerCase().includes(q)
    })
  }, [appointments, search, showCancelled])

  const step = (dir) => {
    if (view === 'month') setCursor((c) => addMonthsKey(c, dir))
    else if (view === 'week') setCursor((c) => addDaysKey(c, dir * 7))
    else setCursor((c) => addDaysKey(c, dir))
  }

  const openNew = (slot = {}) => {
    setEditing(null)
    setDefaults({ date: cursor, time: '08:00', cabinaId: 'cab1', ...slot })
    setModalOpen(true)
  }

  const openEdit = (apt) => {
    setEditing(apt)
    setDefaults({})
    setModalOpen(true)
  }

  const goToDay = (key) => {
    setCursor(key)
    setView('day')
  }

  const rangeLabel = view === 'month' ? formatMonthYear(cursor) : view === 'week' ? formatMonthYear(cursor) : formatLongDate(cursor)

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={branchId}
            onChange={setBranchId}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            size="sm"
            variant="muted"
            className="w-auto min-w-[140px]"
            data-testid="calendar-branch"
          />
          <Button variant="secondary" size="sm" onClick={() => toast('Horarios (próximamente)')} data-testid="calendar-schedules">
            <Clock className="h-4 w-4" /> Horarios
          </Button>
          <Button size="sm" onClick={() => openNew()} data-testid="calendar-multi">
            <Plus className="h-4 w-4" /> Cita Múltiple
          </Button>
        </div>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            data-testid="calendar-search"
            className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                data-testid={`calendar-view-${v.id}`}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  view === v.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCancelled((s) => !s)}
            data-testid="calendar-cancelled"
            className={cn(
              'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
              showCancelled ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            )}
          >
            Ver Canceladas
          </button>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft sm:flex-row sm:justify-between">
        <button type="button" onClick={() => step(-1)} data-testid="calendar-prev" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <ChevronLeft className="h-4 w-4" /> Anterior
        </button>
        <div className="text-center">
          <p className="font-heading text-lg font-bold capitalize text-slate-800" data-testid="calendar-range-label">{rangeLabel}</p>
          <div className="mt-1 flex items-center justify-center gap-2 text-sm text-slate-500">
            <span>IR A:</span>
            <input
              type="date"
              value={cursor}
              onChange={(e) => setCursor(e.target.value)}
              data-testid="calendar-goto"
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCursor(todayKey())} data-testid="calendar-today" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Hoy
          </button>
          <button type="button" onClick={() => step(1)} data-testid="calendar-next" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatedTabPanel panelKey={view}>
        {view === 'week' && (
          <WeekView cursor={cursor} appointments={filtered} onDayClick={goToDay} onAppointmentClick={openEdit} />
        )}
        {view === 'day' && (
          <DayView
            dateKey={cursor}
            appointments={filtered}
            onSlotClick={openNew}
            onAppointmentClick={openEdit}
          />
        )}
        {view === 'month' && (
          <MonthView cursor={cursor} appointments={filtered} onDayClick={goToDay} onAppointmentClick={openEdit} />
        )}
      </AnimatedTabPanel>

      <AppointmentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        appointment={editing}
        defaultDate={defaults.date || cursor}
        defaultSlot={defaults}
        wide
      />
    </div>
  )
}
