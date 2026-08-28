import { useMemo, useState } from 'react'
import { Phone, Mail, Users, StickyNote, CheckSquare, Calendar, Plus, Pencil } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { useConfigStore } from '@/stores/configStore'
import { buildBranchFilterOptions } from '@/lib/branches'
import { ACTIVITY_TYPE_META } from '@/data/crm'
import { fmtDateTime } from '../lib/crm'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { ActivityFormModal } from '../components/ActivityFormModal'
import { TaskCountdown } from '../components/TaskCountdown'
import { cn } from '@/lib/utils'

const ICONS = { Phone, Mail, Users, StickyNote, CheckSquare }

function ActivityIcon({ type }) {
  const meta = ACTIVITY_TYPE_META[type] || ACTIVITY_TYPE_META.nota
  const Icon = ICONS[meta.icon] || StickyNote
  return <Icon className="h-4 w-4" />
}

function ActivityCard({ act, users, onToggle, onEdit }) {
  const meta = ACTIVITY_TYPE_META[act.type]
  const assignee = users.find((u) => u.id === act.assignedUserId)?.name

  return (
    <Card className="p-4" data-testid={`activity-card-${act.id}`}>
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <ActivityIcon type={act.type} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{act.title}</h3>
            <Badge tone="neutral">{meta?.label}</Badge>
            {act.completedAt ? <Badge tone="success">Completada</Badge> : <Badge tone="warning">Pendiente</Badge>}
          </div>
          {act.customerName && <p className="mt-1 text-sm text-slate-500">{act.customerName}</p>}
          {act.description && <p className="mt-2 text-sm text-slate-600">{act.description}</p>}
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            {fmtDateTime(act.dueAt || act.createdAt)}
            {assignee && <span className="ml-2">· {assignee}</span>}
          </p>
          <TaskCountdown dueAt={act.dueAt} completed={!!act.completedAt} />
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => onEdit(act)}
            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            data-testid={`activity-edit-${act.id}`}
          >
            <Pencil className="mx-auto h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onToggle(act.id)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
          >
            {act.completedAt ? 'Reabrir' : 'Completar'}
          </button>
        </div>
      </div>
    </Card>
  )
}

export default function SeguimientoPage() {
  const activities = useCrmStore((s) => s.activities)
  const opportunities = useCrmStore((s) => s.opportunities)
  const toggleActivityComplete = useCrmStore((s) => s.toggleActivityComplete)
  const users = useConfigStore((s) => s.users)
  const branches = useConfigStore((s) => s.branches)
  const [view, setView] = useState('actividades')
  const [branchFilter, setBranchFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const oppBranchMap = useMemo(
    () => Object.fromEntries(opportunities.map((o) => [o.id, o.branchId])),
    [opportunities]
  )

  const grouped = useMemo(() => {
    const branchMatch = (act) => {
      if (branchFilter === 'all') return true
      if (!act.opportunityId) return false
      return oppBranchMap[act.opportunityId] === branchFilter
    }
    const pending = activities.filter((a) => !a.completedAt && branchMatch(a))
    const completed = activities.filter((a) => a.completedAt && branchMatch(a))
    const now = Date.now()
    const overdue = pending.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < now)
    const upcoming = pending.filter((a) => !a.dueAt || new Date(a.dueAt).getTime() >= now)
    upcoming.sort((a, b) => new Date(a.dueAt || a.createdAt) - new Date(b.dueAt || b.createdAt))
    overdue.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    completed.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    return { overdue, upcoming, completed }
  }, [activities, branchFilter, oppBranchMap])

  const filteredOpportunities = useMemo(() => {
    if (branchFilter === 'all') return opportunities
    return opportunities.filter((o) => o.branchId === branchFilter)
  }, [opportunities, branchFilter])

  const oppsByDate = useMemo(() => {
    const groups = {}
    filteredOpportunities.forEach((o) => {
      const key = new Date(o.createdAt).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' })
      if (!groups[key]) groups[key] = []
      groups[key].push(o)
    })
    return Object.entries(groups).sort((a, b) => new Date(b[1][0].createdAt) - new Date(a[1][0].createdAt))
  }, [filteredOpportunities])

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (act) => {
    setEditing(act)
    setFormOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-seguimiento">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Seguimiento</h2>
          <p className="text-sm text-slate-500">Actividades y oportunidades organizadas cronológicamente.</p>
        </div>
        {view === 'actividades' && (
          <Button onClick={openNew} data-testid="activity-new">
            <Plus className="h-4 w-4" /> Nueva tarea
          </Button>
        )}
      </div>

      <Select value={branchFilter} onChange={setBranchFilter} options={buildBranchFilterOptions(branches)} className="max-w-xs" data-testid="seguimiento-branch-filter" />

      <div className="grid w-full max-w-md grid-cols-2 rounded-xl bg-slate-100 p-1">
        {[
          { id: 'actividades', label: 'Actividades' },
          { id: 'oportunidades', label: 'Oportunidades' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-semibold transition-all',
              view === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatedTabPanel panelKey={view}>
      {view === 'actividades' && (
        <div className="space-y-8">
          {grouped.overdue.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-red-500">Retrasadas</h3>
              <div className="space-y-3">
                {grouped.overdue.map((act) => (
                  <ActivityCard key={act.id} act={act} users={users} onToggle={toggleActivityComplete} onEdit={openEdit} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">Pendientes</h3>
            <div className="space-y-3">
              {grouped.upcoming.length === 0 ? (
                <p className="text-sm text-slate-400">No hay tareas pendientes.</p>
              ) : (
                grouped.upcoming.map((act) => (
                  <ActivityCard key={act.id} act={act} users={users} onToggle={toggleActivityComplete} onEdit={openEdit} />
                ))
              )}
            </div>
          </section>

          {grouped.completed.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">Completadas</h3>
              <div className="space-y-3 opacity-80">
                {grouped.completed.map((act) => (
                  <ActivityCard key={act.id} act={act} users={users} onToggle={toggleActivityComplete} onEdit={openEdit} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {view === 'oportunidades' && (
        <div className="space-y-6">
          {oppsByDate.map(([date, opps]) => (
            <div key={date}>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">{date}</h3>
              <div className="space-y-2">
                {opps.map((o) => (
                  <Card key={o.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold text-slate-900">{o.title}</p>
                      <p className="text-sm text-slate-500">{o.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-heading font-bold text-emerald-600">{formatDOP(o.value)}</p>
                      <Badge tone="brand">{o.stage}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </AnimatedTabPanel>

      <ActivityFormModal open={formOpen} onClose={() => setFormOpen(false)} activity={editing} />
    </div>
  )
}
