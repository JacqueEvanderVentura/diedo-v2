import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Car, ChartPie, CheckCircle2, Clock3, DollarSign, Info, Plus, Settings, Wallet } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { useConfigStore } from '@/stores/configStore'
import { useWorkspaceScopeStore } from '@/stores/workspaceScopeStore'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { InlineSetupCard } from '@/components/ui/InlineSetupCard'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CARWASH_PREVIEW_DATE, previewData } from '../data/preview'
import { CARWASH_TABS, resolveCarwashScope } from '../lib/navigation'
import { ConnectedIndicators } from '../components/ConnectedIndicators'
import { CarwashMetric } from '../components/CarwashPrimitives'
import { OperationsPanel } from '../components/OperationsPanel'
import { ConnectedCommissionsPanel } from '../components/ConnectedCommissionsPanel'
import { CommissionsPanel } from '../components/CommissionsPanel'
import { ReportsPanel } from '../components/ReportsPanel'
import { SettingsPanel } from '../components/SettingsPanel'
import { ConnectedSettingsPanel } from '../components/ConnectedSettingsPanel'
import { ConnectedOperationsPanel } from '../components/ConnectedOperationsPanel'
import { CarwashPreviewModal } from '../components/CarwashPreviewModal'

const TAB_ICONS = { Car, DollarSign, ChartPie, Settings }

export default function CarwashPage() {
  const status = useSessionStore((state) => state.status)
  const user = useSessionStore((state) => state.user)
  const hasPermission = useSessionStore((state) => state.hasPermission)
  const hasModule = useSessionStore((state) => state.hasModule)
  const configuredBranches = useConfigStore((state) => state.branches)
  const activeBranchId = useWorkspaceScopeStore((state) => state.activeBranchId)
  const setActiveBranchId = useWorkspaceScopeStore((state) => state.setActiveBranchId)
  const [params, setParams] = useSearchParams()
  const [preview, setPreview] = useState(null)
  const [openRequest, setOpenRequest] = useState(0)
  const [operationAccess, setOperationAccess] = useState(null)
  const [indicatorRevision, setIndicatorRevision] = useState(0)
  const refreshIndicators = useCallback(() => setIndicatorRevision((value) => value + 1), [])
  const tabListRef = useRef(null)
  const isDemo = status === 'demo'
  const allowed = isDemo || (hasModule('carwash') && hasPermission('carwash.read'))
  const branches = (isDemo ? configuredBranches : user?.visibleBranches || []).filter((branch) => branch.active !== false && branch.status !== 'inactive')
  const { tab, branchId } = resolveCarwashScope(params, branches, hasPermission, activeBranchId)
  const branch = branches.find((item) => item.id === branchId)
  const populated = params.get('example') !== 'empty'
  const data = previewData({ isDemo, populated, branchId })
  const canReadCommissions = hasPermission('carwash.commissions.read')
  const canManageWashes = hasPermission('carwash.wash.manage')
  const scopeKey = `${status}:${user?.workspaceId}:${user?.membershipId}:${branchId}`
  const canRegister = tab === 'operativo' && operationAccess?.scopeKey === scopeKey && operationAccess.writable

  useEffect(() => {
    if (!allowed) return
    if (branchId && branchId !== activeBranchId) setActiveBranchId(branchId)
    if (params.get('tab') !== tab || (params.get('branchId') || '') !== branchId) {
      const next = new URLSearchParams(params)
      next.set('tab', tab)
      if (branchId) next.set('branchId', branchId)
      else next.delete('branchId')
      setParams(next, { replace: true })
    }
  }, [activeBranchId, allowed, branchId, params, setActiveBranchId, setParams, tab])

  // A mode/identity change must never leave the synthetic preview open online.
  useEffect(() => { setPreview(null) }, [status, user?.workspaceId, branchId, tab])

  function updateQuery(changes, replace = false) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value == null || value === '' || value === 'all') next.delete(key)
        else next.set(key, value)
      }
      return next
    }, { replace })
  }

  function onTabKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = [...tabListRef.current.querySelectorAll('[role="tab"]:not(:disabled)')]
    const current = buttons.indexOf(document.activeElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    event.preventDefault()
    buttons[index]?.focus()
    buttons[index]?.click()
  }

  if (!allowed) return <div className="p-6"><InlineSetupCard title="Carwash no está disponible" message="Tu workspace necesita tener habilitado el módulo y tu usuario necesita permiso para consultarlo. Contacta al administrador." testId="carwash-access-denied" /></div>

  const pending = data.commissions.filter((item) => item.status === 'pending').reduce((sum, item) => sum + Number(item.amount), 0)
  const completed = data.washes.filter((item) => item.status === 'completed')
  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6" data-testid="carwash-page">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0"><h1 className="flex items-center gap-2 font-heading text-xl min-[380px]:text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"><Car className="h-7 w-7 shrink-0 text-blue-500" aria-hidden />Carwash Management</h1><p className="mt-1 text-sm text-slate-500">Sucursal activa: <strong className="font-semibold text-slate-800">{branch?.name || 'Sin sucursales disponibles'}</strong></p></div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select className="sm:w-56" size="sm" disabled={!branches.length} value={branchId} options={branches.map((item) => ({ value: item.id, label: item.name }))} onChange={(nextBranchId) => updateQuery({ branchId: nextBranchId, employeeId: null, servicePage: null, washPage: null, commissionPage: null, settlementPage: null })} placeholder="Seleccionar sucursal" data-testid="carwash-branch" />
          {canManageWashes && <Button disabled={!branchId || (!isDemo && !canRegister)} title={isDemo ? 'Vista previa del registro' : 'Registrar un vehículo desde Control Operativo'} data-testid="carwash-new-wash" onClick={() => isDemo ? setPreview({ type: 'wash' }) : setOpenRequest((value) => value + 1)}><Plus className="h-4 w-4" aria-hidden />Nuevo Servicio</Button>}
        </div>
      </div>
      {isDemo && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900" role="status" data-testid="carwash-availability-notice">
        <div className="flex min-w-0 items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><p>{`Vista previa · Datos ficticios del ${CARWASH_PREVIEW_DATE}. Las operaciones están deshabilitadas.`}</p></div>
        {isDemo && <Button size="sm" variant="secondary" data-testid="carwash-toggle-example" onClick={() => updateQuery({ example: populated ? 'empty' : null })}>{populated ? 'Ver escenario vacío' : 'Ver ejemplos'}</Button>}
      </div>}
      {!branchId && <InlineSetupCard title="No tienes sucursales disponibles" message="Un administrador debe asignarte una sucursal para operar en Carwash." testId="carwash-no-branches" />}
      {isDemo ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
        <CarwashMetric label="Activos en espera" value={isDemo ? data.washes.filter((item) => ['waiting', 'washing'].includes(item.status)).length : '—'} icon={Clock3} />
        <CarwashMetric label="Completados hoy" value={isDemo ? completed.length : '—'} icon={CheckCircle2} tone="green" />
        <CarwashMetric label="Facturado hoy" value={isDemo ? formatDOP(completed.reduce((sum, item) => sum + Number(item.total), 0)) : '—'} icon={DollarSign} tone="violet" />
        <CarwashMetric label="Comisiones pendientes" value={isDemo && canReadCommissions ? formatDOP(pending) : '—'} icon={Wallet} tone="amber" />
      </div> : <ConnectedIndicators key={scopeKey} branchId={branchId} workspace={user?.workspace} revision={indicatorRevision} />}
      <div className="max-w-full overflow-x-auto pb-1 scrollbar-thin">
        <div ref={tabListRef} role="tablist" aria-label="Secciones de Carwash" onKeyDown={onTabKeyDown} className="inline-flex min-w-max gap-1 rounded-xl bg-slate-200/80 p-1">
          {CARWASH_TABS.map((item) => {
            const Icon = TAB_ICONS[item.icon]
            const permitted = hasPermission(item.permission)
            return <button key={item.id} type="button" role="tab" id={`carwash-tab-${item.id}`} aria-controls={`carwash-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} disabled={!permitted} title={permitted ? item.label : 'Necesitas permiso para acceder a esta sección'} data-testid={`carwash-tab-${item.id}`} onClick={() => updateQuery({ tab: item.id })} className={cn('flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50', tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}><Icon className="h-4 w-4" aria-hidden />{item.label}</button>
          })}
        </div>
      </div>
      <section role="tabpanel" id={`carwash-panel-${tab}`} aria-labelledby={`carwash-tab-${tab}`} tabIndex={0} className="min-w-0 focus-visible:outline-blue-600">
        {tab === 'operativo' && (isDemo ? <OperationsPanel data={data} params={params} updateQuery={updateQuery} isDemo /> : <ConnectedOperationsPanel key={scopeKey} scopeKey={scopeKey} onChanged={refreshIndicators} branchId={branchId} workspace={user?.workspace} params={params} updateQuery={updateQuery} openRequest={openRequest} onAvailability={setOperationAccess} />)}
        {tab === 'comisiones' && (isDemo ? <CommissionsPanel data={data} params={params} updateQuery={updateQuery} isDemo /> : <ConnectedCommissionsPanel onChanged={refreshIndicators} key={scopeKey} branchId={branchId} workspace={user?.workspace} params={params} updateQuery={updateQuery} />)}
        {tab === 'reportes' && <ReportsPanel key={scopeKey} branchId={branchId} workspace={user?.workspace} data={data} isDemo={isDemo} params={params} updateQuery={updateQuery} />}
        {tab === 'configuracion' && (isDemo ? <SettingsPanel services={data.services} isDemo onPreview={setPreview} /> : <ConnectedSettingsPanel key={`${status}:${user?.workspaceId}:${user?.membershipId}:${branchId}`} branchId={branchId} workspace={user?.workspace} params={params} updateQuery={updateQuery} />)}
      </section>
      {isDemo && preview && <CarwashPreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
