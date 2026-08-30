import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Search, Store, Trash2, User } from 'lucide-react'
import { administrationGateway } from '@/services/administrationApi'
import {
  branchAssignmentToApi,
  branchGeneralPatchToApi,
  branchPartnersPatchToApi,
  createBranchToApi,
  fiscalProfileToApi,
  legalEntityReferencesFromBranches,
  mapBranchesFromApi,
  mapLegalEntityFromApi,
} from '@/services/adapters/administration'
import { configFacade } from '@/services/configFacade'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { BranchFormModal } from '../components/BranchFormModal'
import { configPageClass } from '../lib/pageShell'

const EMPTY_SETTINGS = { businessName: '', region: '', taxDefault: 0, version: 1 }

function branchCode(name) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return `${normalized.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20)}-${Date.now().toString(36).slice(-5)}`.toUpperCase()
}

function mapSettings(settings) {
  return {
    businessName: settings.name,
    region: settings.locale,
    taxDefault: Number(settings.taxDefaultRate),
    version: settings.version,
  }
}

function GeneralSettings({ settings, online, canMutate, onSaved }) {
  const localUpdate = useConfigStore((state) => state.updateSettings)
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => setForm(settings), [settings])
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const save = async () => {
    if (saving || (online && !canMutate)) return
    setSaving(true)
    try {
      if (online) {
        const result = await administrationGateway.mutate('updateWorkspaceSettings', {
          name: form.businessName,
          taxDefaultRate: Number(form.taxDefault) || 0,
          version: form.version,
        })
        onSaved(mapSettings(result))
      } else {
        localUpdate({ ...form, taxDefault: Number(form.taxDefault) || 0 })
      }
      toast.success('Ajustes generales guardados')
    } catch (error) {
      toast.error(error.message || 'No se pudieron guardar los ajustes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6" data-testid="config-general-card">
      <h3 className="mb-4 font-heading text-lg font-bold text-slate-800">Ajustes generales</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre del negocio</label><Input value={form.businessName || ''} disabled={saving || (online && !canMutate)} onChange={(event) => set('businessName', event.target.value)} /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Región</label><Input value={form.region || ''} disabled={online || saving} onChange={(event) => set('region', event.target.value)} /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Impuesto default (%)</label><Input type="number" value={form.taxDefault ?? 0} disabled={saving || (online && !canMutate)} onChange={(event) => set('taxDefault', event.target.value)} /></div>
        <div className="flex items-end"><Button className="w-full" onClick={save} disabled={saving || (online && !canMutate)}>{saving ? 'Guardando…' : 'Guardar'}</Button></div>
      </div>
      {online && !canMutate && <p className="mt-3 text-xs text-slate-400">Se requiere el permiso workspace.update para modificar estos ajustes.</p>}
    </Card>
  )
}

export default function SucursalesPage({ embedded = false }) {
  const online = useSessionStore((state) => state.status === 'online')
  const sessionUser = useSessionStore((state) => state.user)
  const canManageBranch = useSessionStore((state) => state.hasPermission('branch.manage'))
  const canReadWorkspace = useSessionStore((state) => state.hasPermission('workspace.read'))
  const canReadLegalEntity = useSessionStore((state) => state.hasPermission('legal_entity.read'))
  const canManageLegalEntity = useSessionStore((state) => state.hasPermission('legal_entity.manage'))
  const canUpdateWorkspace = useSessionStore((state) => state.hasPermission('workspace.update'))
  const branches = useConfigStore((state) => state.branches)
  const localSettings = useConfigStore((state) => state.settings)
  const addLocal = useConfigStore((state) => state.addBranch)
  const updateLocal = useConfigStore((state) => state.updateBranch)
  const deleteLocal = useConfigStore((state) => state.deleteBranch)
  const [legalEntities, setLegalEntities] = useState([])
  const [apiSettings, setApiSettings] = useState(null)
  const [state, setState] = useState(() => ({
    status: online ? 'loading' : 'demo',
    source: online ? null : 'demo',
    error: null,
  }))
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async ({ clear = false } = {}) => {
    if (!online) {
      setState({ status: 'demo', source: 'demo', error: null })
      return true
    }
    const requestedWorkspaceId = sessionUser?.workspaceId
    if (clear) configFacade.clearApiBranches({ workspaceId: requestedWorkspaceId })
    setState((current) => ({ ...current, status: 'loading', error: null }))
    try {
      const workspaceSettingsPromise = canReadWorkspace
        ? administrationGateway.read('workspaceSettings')
        : Promise.resolve(null)
      const legalEntitiesPromise = canReadLegalEntity
        ? administrationGateway.read('legalEntities')
        : Promise.resolve(null)
      const [branchResult, settingsResult, legalEntityResult] = await Promise.all([
        administrationGateway.read('branches'),
        workspaceSettingsPromise,
        legalEntitiesPromise,
      ])
      const mappedEntities = (legalEntityResult?.data || []).map(mapLegalEntityFromApi)
      const mappedBranches = mapBranchesFromApi(branchResult.data, mappedEntities)
      const hydrated = configFacade.hydrateApiBranches(mappedBranches, {
        workspaceId: requestedWorkspaceId,
      })
      if (!hydrated) return false
      setLegalEntities(canReadLegalEntity
        ? mappedEntities
        : legalEntityReferencesFromBranches(branchResult.data))
      setApiSettings(settingsResult ? mapSettings(settingsResult.data) : null)
      const results = [branchResult, settingsResult, legalEntityResult].filter(Boolean)
      const allReady = results.every((result) => result.status === 'ready')
      const anyStale = results.some((result) => result.status === 'stale')
      setState({
        status: allReady ? 'ready' : anyStale ? 'stale' : branchResult.status,
        source: allReady ? 'api' : branchResult.source,
        error: results.find((result) => result.error)?.error || null,
      })
      return allReady
    } catch (error) {
      setState({ status: 'error', source: null, error })
      throw error
    }
  }, [canReadLegalEntity, canReadWorkspace, online, sessionUser?.workspaceId])

  useEffect(() => {
    load({ clear: true }).catch(() => {})
  }, [load])

  const settings = online ? (apiSettings || EMPTY_SETTINGS) : localSettings
  const visibleBranches = online && !state.source ? [] : branches
  const list = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return visibleBranches.filter((branch) => (
      !normalized
      || branch.name.toLowerCase().includes(normalized)
      || branch.address?.toLowerCase().includes(normalized)
      || branch.legalName?.toLowerCase().includes(normalized)
      || branch.rnc?.toLowerCase().includes(normalized)
    ))
  }, [query, visibleBranches])

  const ensureReady = () => {
    if (state.status !== 'ready' || state.source !== 'api') {
      throw new Error('Los cambios están bloqueados hasta recuperar datos vigentes.')
    }
  }

  const submit = async (data, { tab }) => {
    if (!online) {
      editing ? updateLocal(editing.id, data) : addLocal(data)
      toast.success(editing ? 'Sucursal actualizada' : 'Sucursal creada')
      return
    }

    ensureReady()
    let successMessage = 'Sucursal actualizada'
    if (!editing) {
      if (!canManageBranch) throw new Error('No tienes permiso para crear sucursales.')
      if (data.legalEntityMode === 'new' && !canManageLegalEntity) {
        throw new Error('No tienes permiso para crear la entidad legal de esta sucursal.')
      }
      await administrationGateway.mutate('createBranch', createBranchToApi(data, {
        code: branchCode(data.name),
        timezone: sessionUser?.workspace?.timezone || 'America/Santo_Domingo',
      }))
      successMessage = 'Sucursal creada'
    } else if (tab === 'general') {
      if (!canManageBranch) throw new Error('No tienes permiso para actualizar sucursales.')
      await administrationGateway.mutate('updateBranch', editing.id, branchGeneralPatchToApi(data, editing))
    } else if (tab === 'socios') {
      if (!canManageBranch) throw new Error('No tienes permiso para actualizar sucursales.')
      await administrationGateway.mutate('updateBranch', editing.id, branchPartnersPatchToApi(data, editing))
      successMessage = 'Socios actualizados'
    } else if (data.legalEntityAction === 'current') {
      if (!canManageLegalEntity) throw new Error('No tienes permiso para actualizar datos fiscales.')
      await administrationGateway.mutate(
        'updateFiscalProfile',
        editing.legalEntityId,
        fiscalProfileToApi(data, editing.legalEntityVersion)
      )
      successMessage = 'Datos fiscales actualizados'
    } else {
      if (!canManageBranch || !canManageLegalEntity) {
        throw new Error('Compartir o separar una entidad legal requiere permisos sobre sucursales y datos fiscales.')
      }
      await administrationGateway.mutate(
        'assignBranchLegalEntity',
        editing.id,
        branchAssignmentToApi(data, editing)
      )
      successMessage = data.legalEntityAction === 'new'
        ? 'Sucursal separada en una entidad legal nueva'
        : 'Entidad legal compartida con la sucursal'
    }

    const reloaded = await load()
    if (!reloaded) throw new Error('El cambio se guardó, pero no se pudieron recuperar datos vigentes. Recarga antes de continuar.')
    toast.success(successMessage)
  }

  const toggle = async (branch) => {
    if (!online) {
      updateLocal(branch.id, { active: !branch.active })
      return
    }
    try {
      ensureReady()
      if (!canManageBranch) throw new Error('No tienes permiso para actualizar sucursales.')
      await administrationGateway.mutate('updateBranch', branch.id, {
        status: branch.active ? 'inactive' : 'active',
        version: branch.version,
      })
      await load()
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar la sucursal.')
    }
  }

  const archive = async (branch) => {
    try {
      if (online) {
        ensureReady()
        if (!canManageBranch) throw new Error('No tienes permiso para archivar sucursales.')
        await administrationGateway.mutate('archiveBranch', branch.id, branch.version)
        await load()
      } else {
        deleteLocal(branch.id)
      }
      toast.success('Sucursal archivada')
    } catch (error) {
      toast.error(error.message || 'No se pudo archivar la sucursal.')
    }
  }

  const openNew = () => {
    if (online && (!canManageBranch || state.status !== 'ready')) return
    setEditing(null)
    setModalOpen(true)
  }

  const openBranch = (branch) => {
    setEditing(branch)
    setModalOpen(true)
  }

  return (
    <div className={configPageClass(embedded)} data-testid="sucursales-page">
      {(!online || canReadWorkspace) && (
        <GeneralSettings
          settings={settings}
          online={online}
          canMutate={state.status === 'ready' && canUpdateWorkspace}
          onSaved={setApiSettings}
        />
      )}
      {online && <p className="text-xs text-slate-400">Estado: {state.status} · fuente: {state.source || '—'}</p>}
      {state.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{state.error.message}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Total</p><p className="mt-1 text-2xl font-bold">{visibleBranches.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Activas</p><p className="mt-1 text-2xl font-bold text-emerald-600">{visibleBranches.filter((branch) => branch.active).length}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Inactivas</p><p className="mt-1 text-2xl font-bold text-slate-400">{visibleBranches.filter((branch) => !branch.active).length}</p></Card>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-md flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar sucursales..." className="w-full rounded-xl bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-slate-200" /></div>
        <Button data-testid="sucursal-new" onClick={openNew} disabled={online && (!canManageBranch || state.status !== 'ready')}><Plus className="h-4 w-4" /> Nueva sucursal</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {list.map((branch) => (
          <Card key={branch.id} className="p-5" data-testid={`sucursal-card-${branch.id}`}>
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h4 className="font-bold">{branch.name}</h4><Badge tone={branch.active ? 'success' : 'neutral'}>{branch.active ? 'Activa' : 'Inactiva'}</Badge>{branch.sharing?.shared && <Badge tone="info">Fiscal compartido</Badge>}</div>
                <div className="mt-3 space-y-1 text-sm text-slate-500">
                  {branch.address && <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0" />{branch.address}</p>}
                  {branch.phone && <p className="flex gap-2"><Phone className="h-4 w-4 shrink-0" />{branch.phone}</p>}
                  {branch.email && <p className="flex gap-2"><Mail className="h-4 w-4 shrink-0" />{branch.email}</p>}
                  <p className="flex gap-2"><User className="h-4 w-4 shrink-0" />{branch.manager || 'Sin encargado'}</p>
                  {online && canReadLegalEntity && <p className="flex gap-2" data-testid={`sucursal-fiscal-${branch.id}`}><Building2 className="h-4 w-4 shrink-0" /><span>{branch.legalName || 'Sin razón social'}{branch.rnc ? ` · RNC ${branch.rnc}` : ''}{branch.sharing?.shared ? ` · ${branch.sharing.branchCount} sucursales` : ''}</span></p>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label={branch.active ? 'Desactivar sucursal' : 'Activar sucursal'} disabled={online && (!canManageBranch || state.status !== 'ready')} onClick={() => toggle(branch)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><Store className="h-4 w-4" /></button>
                <button type="button" data-testid={`sucursal-edit-${branch.id}`} aria-label="Ver o editar sucursal" onClick={() => openBranch(branch)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                <button type="button" aria-label="Archivar sucursal" disabled={online && (!canManageBranch || state.status !== 'ready')} onClick={() => archive(branch)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <BranchFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        branch={editing}
        onSubmit={submit}
        online={online}
        legalEntities={legalEntities}
        canManageBranch={canManageBranch && state.status === 'ready'}
        canReadLegalEntity={canReadLegalEntity}
        canManageLegalEntity={canReadLegalEntity && canManageLegalEntity && state.status === 'ready'}
        supportsAtomicNewEntity
      />
    </div>
  )
}
