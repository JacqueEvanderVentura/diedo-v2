import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { AnimatedOutlet } from './AnimatedOutlet'
import { getPageMeta } from '@/data/navigation'
import { useCrmStore } from '@/stores/crmStore'
import { useCustomersStore } from '@/stores/customersStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useSessionStore } from '@/stores/sessionStore'
import { requiresFinanceData } from '@/services/moduleAvailability'
import { ElevationBanner } from '@/components/auth/ElevationBanner'
import { DataSourceNotice } from '@/components/ui/DataSourceNotice'

const CRM_SECTION_BY_PATH = Object.freeze({
  '/crm': 'overview',
  '/crm/clientes': 'customers',
  '/crm/leads': 'leads',
  '/crm/pipeline': 'pipeline',
  '/crm/seguimiento': 'activities',
  '/crm/cotizaciones': 'quotes',
  '/crm/compras': 'purchases',
  '/crm/ventas': 'sales',
  '/crm/workspace': 'workspace',
})

const CRM_SECTIONS_REQUIRING_CUSTOMERS = new Set(['customers', 'pipeline', 'quotes', 'purchases'])

// Persistent chrome: sidebar stays mounted across module/submodule changes.
export function AppFrame() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="relative z-0 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-clip">
        <ElevationBanner />
        <Outlet />
      </div>
    </div>
  )
}

// Standard inner frame: navbar + scrollable content.
// POS uses its own full-height frame, so it does NOT wrap in PageShell.
export function PageShell() {
  const { pathname } = useLocation()
  const { title, subtitle } = getPageMeta(pathname)
  const sessionStatus = useSessionStore((state) => state.status)
  const canReadCrm = useSessionStore((s) => s.hasPermission('crm.read'))
  const canReadCustomers = useSessionStore((s) => s.hasPermission('customer.read'))
  const canReadCatalog = useSessionStore((s) => s.hasPermission('catalog.read'))
  const crmDataState = useCrmStore((s) => s.dataState)
  const canReadFinance = useSessionStore((state) => (
    state.hasModule('finance') && state.hasPermission('finance.read')
  ))
  const hydrateCrmSection = useCrmStore((state) => state.hydrateSection)
  const hydrateCustomers = useCustomersStore((state) => state.hydrate)
  const hydrateCatalog = useCatalogStore((state) => state.hydrateFromApi)
  const hydrateFinance = useFinanzasStore((state) => state.hydrateFromApi)
  const crmSection = CRM_SECTION_BY_PATH[pathname] || null
  const shouldHydrateFinance = requiresFinanceData(pathname)

  useEffect(() => {
    if (!crmSection || !['online', 'demo'].includes(sessionStatus)) return
    useCrmStore.getState().ensureWorkspaceSettings().catch(() => {})
    const requests = canReadCrm || sessionStatus === 'demo' ? [hydrateCrmSection(crmSection)] : []
    if (CRM_SECTIONS_REQUIRING_CUSTOMERS.has(crmSection) && (canReadCustomers || sessionStatus === 'demo')) {
      requests.push(hydrateCustomers({ force: true }))
    }
    if (['quotes', 'pipeline', 'customers'].includes(crmSection) && sessionStatus === 'online' && canReadCatalog) {
      requests.push(hydrateCatalog(useConfigStore.getState().branches))
    }
    Promise.allSettled(requests)
      .then(() => {
        useCustomersStore.getState().mergeCrmProfiles(useCrmStore.getState().customers)
      })
  }, [crmSection, hydrateCatalog, hydrateCrmSection, hydrateCustomers, sessionStatus, canReadCrm, canReadCustomers, canReadCatalog])

  useEffect(() => {
    if (!shouldHydrateFinance || sessionStatus !== 'online' || !canReadFinance) return
    hydrateFinance({ force: true }).catch(() => {
      // The store exposes the operational error to the finance screens.
    })
  }, [canReadFinance, hydrateFinance, pathname, sessionStatus, shouldHydrateFinance])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <Navbar title={title} subtitle={subtitle} />
      <main className="relative z-0 flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-auto scrollbar-thin [scrollbar-gutter:stable]">
        {crmSection && canReadCrm && ['loading', 'error'].includes(crmDataState.status) && (
          <DataSourceNotice state={crmDataState} onRetry={() => hydrateCrmSection(crmSection)} className="m-4" />
        )}
        {!(crmSection && canReadCrm && crmDataState.status === 'error') && <AnimatedOutlet className="flex min-h-0 flex-1 flex-col" />}
      </main>
    </div>
  )
}

export default PageShell
