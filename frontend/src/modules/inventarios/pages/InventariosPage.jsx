import { useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Package,
  AlertTriangle,
  PackageX,
  DollarSign,
  Landmark,
  Boxes,
  Wrench,
  History,
} from 'lucide-react'
import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useActivosStore } from '@/stores/activosStore'
import { formatDOP } from '@/lib/format'
import { ProductosTab } from '../components/ProductosTab'
import { ActivosTab } from '../components/ActivosTab'
import { MovimientosTab } from '../components/MovimientosTab'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'productos', label: 'Productos', icon: Package },
  { id: 'activos', label: 'Activos', icon: Landmark },
  { id: 'movimientos', label: 'Movimientos', icon: History },
]

function StatCard({ label, value, icon: Icon, tone }) {
  const tones = {
    brand: 'bg-blue-50 text-blue-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-red-50 text-red-600',
    success: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export default function InventariosPage() {
  const [params, setParams] = useSearchParams()
  const isOnline = useSessionStore((s) => s.isOnline())
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated())
  const hydrateFromApi = useCatalogStore((s) => s.hydrateFromApi)
  const categories = useConfigStore((s) => s.categories)
  const branches = useConfigStore((s) => s.branches)

  useEffect(() => {
    if (isOnline && isAuthenticated) {
      hydrateFromApi(categories, branches).catch(() => {})
    }
  }, [isOnline, isAuthenticated, hydrateFromApi, categories, branches])
  const tabParam = params.get('tab') || 'productos'
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'productos'

  const products = useCatalogStore((s) => s.products)
  const activos = useActivosStore((s) => s.activos)

  const productStats = useMemo(() => useCatalogStore.getState().getInventoryStats(), [products])
  const activoStats = useMemo(() => useActivosStore.getState().getStats(), [activos])

  const setTab = (id) => setParams({ tab: id })

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      {tab === 'activos' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Valor total (activos)" value={formatDOP(activoStats.totalValue)} icon={Landmark} tone="brand" />
          <StatCard label="Operativos" value={activoStats.operativos} icon={Boxes} tone="success" />
          <StatCard label="En reparación" value={activoStats.reparacion} icon={Wrench} tone="warning" />
          <StatCard label="Dados de baja" value={activoStats.baja} icon={PackageX} tone="slate" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Productos" value={productStats.total} icon={Package} tone="brand" />
          <StatCard label="Insumos" value={productStats.supplies ?? 0} icon={Boxes} tone="slate" />
          <StatCard label="Stock Bajo" value={productStats.low} icon={AlertTriangle} tone="warning" />
          <StatCard label="Sin Stock" value={productStats.out} icon={PackageX} tone="danger" />
          <StatCard label="Valor Total" value={formatDOP(productStats.totalValue)} icon={DollarSign} tone="success" />
        </div>
      )}

      <div className="grid w-full max-w-xl grid-cols-3 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              data-testid={`inventory-tab-${t.id}`}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      <AnimatedTabPanel panelKey={tab}>
        {tab === 'productos' && <ProductosTab />}
        {tab === 'activos' && <ActivosTab />}
        {tab === 'movimientos' && <MovimientosTab />}
      </AnimatedTabPanel>
    </div>
  )
}
