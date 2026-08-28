import { useMemo, useState } from 'react'
import { Phone, Mail, Users, StickyNote, CheckSquare, Calendar } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { ACTIVITY_TYPE_META } from '@/data/crm'
import { fmtDateTime } from '../lib/crm'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { cn } from '@/lib/utils'

const ICONS = { Phone, Mail, Users, StickyNote, CheckSquare }

function ActivityIcon({ type }) {
  const meta = ACTIVITY_TYPE_META[type] || ACTIVITY_TYPE_META.nota
  const Icon = ICONS[meta.icon] || StickyNote
  return <Icon className="h-4 w-4" />
}

export default function SeguimientoPage() {
  const activities = useCrmStore((s) => s.activities)
  const opportunities = useCrmStore((s) => s.opportunities)
  const toggleActivityComplete = useCrmStore((s) => s.toggleActivityComplete)
  const [view, setView] = useState('actividades')

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => new Date(b.dueAt || b.createdAt) - new Date(a.dueAt || a.createdAt)),
    [activities]
  )

  const oppsByDate = useMemo(() => {
    const groups = {}
    opportunities.forEach((o) => {
      const key = new Date(o.createdAt).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' })
      if (!groups[key]) groups[key] = []
      groups[key].push(o)
    })
    return Object.entries(groups).sort((a, b) => new Date(b[1][0].createdAt) - new Date(a[1][0].createdAt))
  }, [opportunities])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-seguimiento">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Seguimiento</h2>
        <p className="text-sm text-slate-500">Actividades y oportunidades organizadas cronológicamente.</p>
      </div>

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
        <div className="space-y-3">
          {sortedActivities.map((act) => {
            const meta = ACTIVITY_TYPE_META[act.type]
            return (
              <Card key={act.id} className="p-4">
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
                    <p className="mt-1 text-sm text-slate-500">{act.customerName}</p>
                    {act.description && <p className="mt-2 text-sm text-slate-600">{act.description}</p>}
                    <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                      <Calendar className="h-3.5 w-3.5" />
                      {fmtDateTime(act.dueAt || act.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActivityComplete(act.id)}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    {act.completedAt ? 'Reabrir' : 'Completar'}
                  </button>
                </div>
              </Card>
            )
          })}
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
    </div>
  )
}
