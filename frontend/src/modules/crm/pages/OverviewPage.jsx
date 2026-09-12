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
  ScanSearch,
  ClipboardList,
} from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { FEATURES } from '@/config/features'
import {
  buildCrmOverviewStats,
  buildCrmOverviewKpis,
  buildCrmNavCards,
} from '@/modules/crm/lib/crmOverview'

const KPI_ICONS = {
  leads: Users,
  qualified: Target,
  converted: TrendingUp,
  pipeline: DollarSign,
  salesMonth: TrendingUp,
  activities: ClipboardList,
}

const NAV_ICONS = {
  leads: ScanSearch,
  pipeline: Briefcase,
  cotizaciones: FileText,
  seguimiento: History,
  clientes: UserPlus,
  ventas: TrendingUp,
  compras: ShoppingBag,
  reportes: BarChart3,
}

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
        <span className="max-w-[55%] text-right text-xs text-slate-400">{sublabel}</span>
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
  const overview = useCrmStore((s) => s.overview)
  const leads = useCrmStore((s) => s.leads)
  const opportunities = useCrmStore((s) => s.opportunities)
  const activities = useCrmStore((s) => s.activities)

  const stats = useMemo(
    () =>
      buildCrmOverviewStats({
        overview,
        leads,
        opportunities,
        activities,
      }),
    [leads, opportunities, activities, overview],
  )

  const kpis = useMemo(() => buildCrmOverviewKpis(stats), [stats])

  const navCards = useMemo(
    () => buildCrmNavCards({ crmDiscovery: FEATURES.crmDiscovery }),
    [],
  )

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-overview">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">CRM</h2>
        <p className="text-sm text-slate-500">
          Embudo comercial: desde el lead hasta la venta, sin saltar de módulo.
        </p>
      </div>

      <div
        className={cn(
          'grid grid-cols-1 gap-4 sm:grid-cols-2',
          kpis.length > 4 ? 'xl:grid-cols-3' : 'xl:grid-cols-4',
        )}
      >
        {kpis.map((kpi) => {
          const Icon = KPI_ICONS[kpi.key] || Users
          const displayValue = kpi.valueIsMoney ? formatDOP(kpi.rawValue) : kpi.value
          return (
            <KpiCard
              key={kpi.key}
              label={kpi.label}
              sublabel={kpi.sublabel}
              value={displayValue}
              icon={Icon}
              tone={kpi.tone}
            />
          )
        })}
      </div>

      <div>
        <h3 className="mb-3 font-heading text-sm font-semibold uppercase tracking-wider text-slate-400">
          Recorre el embudo
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {navCards.map((card) => {
            const Icon = NAV_ICONS[card.navKey] || Briefcase
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
    </div>
  )
}
