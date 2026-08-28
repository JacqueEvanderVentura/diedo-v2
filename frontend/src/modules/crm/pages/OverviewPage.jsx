import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Target,
  TrendingUp,
  DollarSign,
  UserPlus,
  Briefcase,
  FileText,
  History,
  ShoppingBag,
  BarChart3,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

const NAV_CARDS = [
  { title: 'Clientes', desc: 'Directorio de clientes B2B/B2C con estados, historial y asignaciones.', to: '/crm/clientes', icon: UserPlus, tone: 'brand' },
  { title: 'Leads & Discovery', desc: 'Encuentra leads con búsqueda web, puntúalos y conviértelos.', to: '/crm/leads', icon: Sparkles, tone: 'violet' },
  { title: 'Pipeline', desc: 'Embudo de ventas Kanban con valores por etapa y seguimiento de deals.', to: '/crm/pipeline', icon: Briefcase, tone: 'emerald' },
  { title: 'Ventas & Facturas', desc: 'Historial de ventas registradas desde POS y CRM.', to: '/crm/ventas', icon: TrendingUp, tone: 'cyan' },
  { title: 'Cotizaciones', desc: 'Genera cotizaciones con productos, sucursal y estados de seguimiento.', to: '/crm/cotizaciones', icon: FileText, tone: 'purple' },
  { title: 'Seguimiento', desc: 'Actividades y oportunidades organizadas cronológicamente.', to: '/crm/seguimiento', icon: History, tone: 'sky' },
  { title: 'Compras por Cliente', desc: 'Historial de compras agregado por cliente desde POS.', to: '/crm/compras', icon: ShoppingBag, tone: 'amber' },
  { title: 'Reporte Consolidado', desc: 'Vista unificada de ingresos por origen y sucursal.', to: '/reportes/generales', icon: BarChart3, tone: 'indigo' },
]

function KpiCard({ label, sublabel, value, icon: Icon, tone }) {
  const tones = {
    brand: 'bg-blue-50 text-blue-600',
    info: 'bg-cyan-50 text-cyan-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
  }
  return (
    <Card className="p-5 transition-transform hover:scale-[1.02]">
      <div className="flex items-start justify-between">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-xs text-slate-400">{sublabel}</span>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  )
}

const toneMap = {
  brand: 'text-blue-600',
  violet: 'text-violet-600',
  emerald: 'text-emerald-600',
  cyan: 'text-cyan-600',
  purple: 'text-purple-600',
  sky: 'text-sky-600',
  amber: 'text-amber-600',
  indigo: 'text-indigo-600',
}

const iconBg = {
  brand: 'bg-blue-50',
  violet: 'bg-violet-50',
  emerald: 'bg-emerald-50',
  cyan: 'bg-cyan-50',
  purple: 'bg-purple-50',
  sky: 'bg-sky-50',
  amber: 'bg-amber-50',
  indigo: 'bg-indigo-50',
}

export default function CrmOverviewPage() {
  const leads = useCrmStore((s) => s.leads)
  const opportunities = useCrmStore((s) => s.opportunities)

  const stats = useMemo(() => {
    const qualified = leads.filter((l) => l.status === 'calificado').length
    const convertedMonth = leads.filter((l) => {
      if (l.status !== 'convertido') return false
      const d = new Date(l.updatedAt)
      const n = new Date()
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
    }).length
    const pipelineValue = opportunities
      .filter((o) => !['cerrado', 'perdido'].includes(o.stage))
      .reduce((a, o) => a + (o.value || 0), 0)
    return {
      totalLeads: leads.length,
      qualifiedLeads: qualified,
      convertedMonth,
      pipelineValue,
    }
  }, [leads, opportunities])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-overview">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">CRM</h2>
        <p className="text-sm text-slate-500">Centro de gestión de relaciones con clientes.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Leads" sublabel="Oportunidades totales" value={stats.totalLeads} icon={Users} tone="brand" />
        <KpiCard label="Leads Calificados" sublabel="En proceso" value={stats.qualifiedLeads} icon={Target} tone="info" />
        <KpiCard label="Convertidos (Mes)" sublabel="Ventas ganadas este mes" value={stats.convertedMonth} icon={TrendingUp} tone="success" />
        <KpiCard label="Valor Pipeline" sublabel="Proyección actual" value={formatDOP(stats.pipelineValue)} icon={DollarSign} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {NAV_CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.to} to={card.to} className="group">
              <Card className="h-full p-6 transition-all hover:shadow-md">
                <div className="flex items-start gap-4">
                  <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-xl', iconBg[card.tone])}>
                    <Icon className={cn('h-7 w-7', toneMap[card.tone])} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-lg font-semibold text-slate-900">{card.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{card.desc}</p>
                    <div className={cn('mt-4 inline-flex items-center gap-2 text-sm font-semibold', toneMap[card.tone])}>
                      Ver módulo
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
