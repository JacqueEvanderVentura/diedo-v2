import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, ChevronLeft, ChevronRight, Clock, User, Pencil, Trash2, CalendarDays } from 'lucide-react'
import { useAgendaStore, statusMeta, toKey, todayKey } from '@/stores/agendaStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { AppointmentFormModal } from '../components/AppointmentFormModal'
import { cn } from '@/lib/utils'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const longDate = (key) => {
  const d = fromKey(key)
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
const startOfWeek = (key) => {
  const d = fromKey(key)
  const diff = d.getDay() // 0 = domingo
  d.setDate(d.getDate() - diff)
  return toKey(d)
}
const addDaysKey = (key, n) => {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

function AppointmentCard({ apt, onEdit, onDelete, compact }) {
  const st = statusMeta(apt.status)
  return (
    <div
      data-testid={`agenda-apt-${apt.id}`}
      className="group rounded-xl border border-slate-100 bg-white p-3 shadow-soft transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Clock className="h-3.5 w-3.5 text-blue-500" />
          {apt.time}
        </div>
        <Badge tone={st.tone}>{st.name}</Badge>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <User className="h-3.5 w-3.5 text-slate-400" /> {apt.customerName}
      </p>
      {apt.serviceName && (
        <p className={cn('mt-0.5 truncate text-xs text-slate-500', compact && 'text-[11px]')}>
          {apt.serviceName} {apt.price > 0 && <span className="text-blue-600">· {formatDOP(apt.price)}</span>}
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-slate-400">{apt.duration} min</p>
      <div className="mt-2 flex items-center gap-1">
        <button onClick={() => onEdit(apt)} data-testid={`agenda-edit-${apt.id}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(apt)} data-testid={`agenda-delete-${apt.id}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function AgendaPage() {
  const appointments = useAgendaStore((s) => s.appointments)
  const deleteAppointment = useAgendaStore((s) => s.deleteAppointment)

  const [view, setView] = useState('day') // 'day' | 'week'
  const [cursor, setCursor] = useState(todayKey())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formDate, setFormDate] = useState(todayKey())

  const byDate = useMemo(() => {
    const map = {}
    appointments.forEach((a) => { (map[a.date] ||= []).push(a) })
    Object.values(map).forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)))
    return map
  }, [appointments])

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i))
  }, [cursor])

  const step = (dir) => setCursor((c) => addDaysKey(c, dir * (view === 'day' ? 1 : 7)))

  const openNew = (date) => { setEditing(null); setFormDate(date || cursor); setModalOpen(true) }
  const openEdit = (apt) => { setEditing(apt); setModalOpen(true) }
  const handleDelete = (apt) => { deleteAppointment(apt.id); toast.success('Cita eliminada') }

  const dayList = byDate[cursor] || []
  const rangeLabel = view === 'day'
    ? longDate(cursor)
    : `${fromKey(weekDays[0]).getDate()} ${MONTHS[fromKey(weekDays[0]).getMonth()]} – ${fromKey(weekDays[6]).getDate()} ${MONTHS[fromKey(weekDays[6]).getMonth()]}`

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} data-testid="agenda-prev" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => step(1)} data-testid="agenda-next" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => setCursor(todayKey())} data-testid="agenda-today" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">
            Hoy
          </button>
          <p className="ml-1 font-heading text-base font-bold text-slate-800 first-letter:uppercase sm:text-lg" data-testid="agenda-range-label">{rangeLabel}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {[['day', 'Día'], ['week', 'Semana']].map(([id, label]) => (
              <button key={id} onClick={() => setView(id)} data-testid={`agenda-view-${id}`}
                className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors', view === id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>
                {label}
              </button>
            ))}
          </div>
          <Button onClick={() => openNew()} data-testid="agenda-new-btn">
            <Plus className="h-4 w-4" /> Nueva cita
          </Button>
        </div>
      </div>

      {/* Day view */}
      {view === 'day' && (
        <Card className="p-5" data-testid="agenda-day-view">
          {dayList.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Sin citas este día" description="Agenda una cita con el botón «Nueva cita»." className="py-14" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dayList.map((apt) => (
                <AppointmentCard key={apt.id} apt={apt} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Week view */}
      {view === 'week' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7" data-testid="agenda-week-view">
          {weekDays.map((key) => {
            const d = fromKey(key)
            const list = byDate[key] || []
            const isToday = key === todayKey()
            return (
              <div key={key} className="flex flex-col rounded-2xl border border-slate-100 bg-white shadow-soft">
                <button
                  onClick={() => openNew(key)}
                  data-testid={`agenda-daycol-${key}`}
                  className={cn('flex items-center justify-between rounded-t-2xl border-b border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-50', isToday && 'bg-blue-50')}
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-400">{DAY_NAMES[d.getDay()]}</p>
                    <p className={cn('font-heading text-lg font-bold', isToday ? 'text-blue-600' : 'text-slate-700')}>{d.getDate()}</p>
                  </div>
                  {list.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{list.length}</span>}
                </button>
                <div className="flex-1 space-y-2 p-2">
                  {list.length === 0 ? (
                    <p className="py-6 text-center text-[11px] text-slate-300">—</p>
                  ) : (
                    list.map((apt) => <AppointmentCard key={apt.id} apt={apt} onEdit={openEdit} onDelete={handleDelete} compact />)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AppointmentFormModal open={modalOpen} onClose={() => setModalOpen(false)} appointment={editing} defaultDate={formDate} />
    </div>
  )
}
