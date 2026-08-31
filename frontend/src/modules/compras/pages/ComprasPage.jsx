import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { COMPRAS_TABS } from '@/data/compras'
import { ProveedoresTab } from '../components/ProveedoresTab'
import { SolicitudesTab } from '../components/SolicitudesTab'
import { ConfiguracionTab } from '../components/ConfiguracionTab'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useComprasStore } from '@/stores/comprasStore'
import { useSessionStore } from '@/stores/sessionStore'

const TAB_COMPONENTS = {
  proveedores: ProveedoresTab,
  solicitudes: SolicitudesTab,
  configuracion: ConfiguracionTab,
}

export default function ComprasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || 'proveedores'
  const activeTab = TAB_COMPONENTS[tabParam] ? tabParam : 'proveedores'
  const ActivePanel = TAB_COMPONENTS[activeTab]
  const isOnline = useSessionStore((state) => state.isOnline())
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated())
  const hydrateFromApi = useComprasStore((state) => state.hydrateFromApi)
  const hydrating = useComprasStore((state) => state.hydrating)
  const error = useComprasStore((state) => state.error)

  useEffect(() => {
    if (isOnline && isAuthenticated) hydrateFromApi().catch(() => {})
  }, [isOnline, isAuthenticated, hydrateFromApi])

  const setTab = (id) => {
    setSearchParams(id === 'proveedores' ? {} : { tab: id }, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="compras-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Módulo de Compras</p>
        <h1 className="text-2xl font-bold text-slate-900">Gestión de Compras</h1>
        <p className="mt-1 text-sm text-slate-500">Proveedores, solicitudes y flujos de aprobación.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {COMPRAS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {hydrating && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Cargando Compras desde la API…
        </div>
      )}

      {error && isOnline && !hydrating && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <Button size="sm" variant="secondary" onClick={() => hydrateFromApi({ force: true }).catch(() => {})}>
            Reintentar
          </Button>
        </div>
      )}

      <AnimatedTabPanel panelKey={activeTab}>
        <ActivePanel />
      </AnimatedTabPanel>
    </div>
  )
}
