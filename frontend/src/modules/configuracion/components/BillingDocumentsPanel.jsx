import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, Save, Trash2 } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { administrationGateway } from '@/services/administrationApi'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { configPageClass } from '../lib/pageShell'
import { DEFAULT_BILLING_DOCUMENTS } from '../lib/billingDocuments'
import { isSettingsBlockVisible } from '../lib/settingsSearch'
import {
  mapWorkspaceSettingsFromApi,
  workspaceBillingDocumentsPatchToApi,
} from '../lib/workspaceSettings'

const MAX_LOGO_BYTES = 1024 * 1024

function mergeBillingDraft(source = {}) {
  return {
    ...DEFAULT_BILLING_DOCUMENTS,
    ...source,
  }
}

export default function BillingDocumentsPanel({ embedded = false, visibleBlockIds }) {
  const settings = useConfigStore((s) => s.settings)
  const updateBillingDocuments = useConfigStore((s) => s.updateBillingDocuments)
  const updateSettings = useConfigStore((s) => s.updateSettings)
  const online = useSessionStore((state) => state.status === 'online')
  const canReadWorkspace = useSessionStore((state) => state.hasPermission('workspace.read'))
  const canUpdateWorkspace = useSessionStore((state) => state.hasPermission('workspace.update'))
  const fileRef = useRef(null)

  const [draft, setDraft] = useState(() => mergeBillingDraft({}))
  const [ready, setReady] = useState(() => !online)
  const [loading, setLoading] = useState(() => online && canReadWorkspace)
  const [saving, setSaving] = useState(false)

  const applyBillingDocuments = useCallback((billingDocuments, version) => {
    const merged = mergeBillingDraft(billingDocuments)
    setDraft(merged)
    updateBillingDocuments(merged)
    if (version != null) {
      updateSettings({ version })
    }
  }, [updateBillingDocuments, updateSettings])

  const load = useCallback(async () => {
    if (!online) {
      setDraft(mergeBillingDraft(useConfigStore.getState().settings.billingDocuments))
      setReady(true)
      return
    }
    if (!canReadWorkspace) {
      setDraft(mergeBillingDraft(useConfigStore.getState().settings.billingDocuments))
      setReady(true)
      return
    }
    setReady(false)
    setLoading(true)
    try {
      const result = await administrationGateway.read('workspaceSettings')
      if (result?.data) {
        const mapped = mapWorkspaceSettingsFromApi(result.data)
        applyBillingDocuments(mapped.billingDocuments, mapped.version)
      }
    } catch (error) {
      toast.error(error.message || 'No se pudieron cargar los datos de facturación.')
      setDraft(mergeBillingDraft(useConfigStore.getState().settings.billingDocuments))
    } finally {
      setLoading(false)
      setReady(true)
    }
  }, [applyBillingDocuments, canReadWorkspace, online])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))

  const onLogoFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('El logo debe ser una imagen (PNG, JPG, SVG).')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('El logo no puede superar 1 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      set('logoDataUrl', String(reader.result || ''))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const save = async () => {
    if (saving || (online && !canUpdateWorkspace)) return
    setSaving(true)
    try {
      if (online) {
        const result = await administrationGateway.mutate(
          'updateWorkspaceSettings',
          workspaceBillingDocumentsPatchToApi(draft, settings.version),
        )
        const mapped = mapWorkspaceSettingsFromApi(result)
        applyBillingDocuments(mapped.billingDocuments, mapped.version)
      } else {
        updateBillingDocuments(draft)
      }
      toast.success('Datos de cotizaciones y facturas guardados')
    } catch (error) {
      toast.error(error.message || 'No se pudieron guardar los datos de facturación.')
    } finally {
      setSaving(false)
    }
  }

  const disabled = !ready || loading || saving || (online && !canUpdateWorkspace)

  return (
    <div className={embedded ? '' : configPageClass} data-testid="billing-documents-panel">
      <p className="mb-4 text-sm text-slate-600">
        Estos datos aparecen en cotizaciones y facturas (POS y CRM).
        {online ? ' Se guardan en el workspace y se sincronizan entre dispositivos.' : ' Modo demo: se guardan en esta sesión.'}
      </p>

      {!ready && (
        <p className="mb-4 text-sm text-slate-500" data-testid="billing-documents-loading">
          Cargando datos de facturación…
        </p>
      )}

      <div className={ready ? 'space-y-4' : 'hidden'} aria-hidden={!ready}>
        {isSettingsBlockVisible(visibleBlockIds, 'logo') && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-28 min-w-[12rem] max-w-full flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 sm:max-w-md">
            {draft.logoDataUrl ? (
              <img
                src={draft.logoDataUrl}
                alt="Logo"
                className="max-h-24 w-auto max-w-full object-contain"
              />
            ) : (
              <ImagePlus className="h-10 w-10 text-slate-300" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogoFile} />
            <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => fileRef.current?.click()}>
              Subir logo
            </Button>
            {draft.logoDataUrl && (
              <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => set('logoDataUrl', '')}>
                <Trash2 className="h-4 w-4" /> Quitar
              </Button>
            )}
          </div>
        </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {isSettingsBlockVisible(visibleBlockIds, 'trade-name') && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nombre comercial</label>
            <Input
              value={draft.tradeName}
              disabled={disabled}
              onChange={(e) => set('tradeName', e.target.value)}
              placeholder="Nombre comercial en facturas"
              data-testid="billing-trade-name"
            />
          </div>
          )}
          {isSettingsBlockVisible(visibleBlockIds, 'legal-name') && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Razón social</label>
            <Input
              value={draft.legalName}
              disabled={disabled}
              onChange={(e) => set('legalName', e.target.value)}
              placeholder="Empresa S.R.L."
              data-testid="billing-legal-name"
            />
          </div>
          )}
          {isSettingsBlockVisible(visibleBlockIds, 'rnc') && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">RNC</label>
            <Input
              value={draft.rnc}
              disabled={disabled}
              onChange={(e) => set('rnc', e.target.value)}
              placeholder="1-3290890-2"
              data-testid="billing-rnc"
            />
          </div>
          )}
          {isSettingsBlockVisible(visibleBlockIds, 'phone') && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Teléfono</label>
            <Input value={draft.phone} disabled={disabled} onChange={(e) => set('phone', e.target.value)} placeholder="809-555-0000" />
          </div>
          )}
          {isSettingsBlockVisible(visibleBlockIds, 'address') && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Dirección fiscal</label>
            <Input value={draft.address} disabled={disabled} onChange={(e) => set('address', e.target.value)} placeholder="Av. …, Santo Domingo" />
          </div>
          )}
          {isSettingsBlockVisible(visibleBlockIds, 'email') && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Correo</label>
            <Input type="email" value={draft.email} disabled={disabled} onChange={(e) => set('email', e.target.value)} placeholder="facturacion@empresa.com" />
          </div>
          )}
          {isSettingsBlockVisible(visibleBlockIds, 'footer') && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Nota al pie (opcional)</label>
            <Input
              value={draft.footerNote}
              disabled={disabled}
              onChange={(e) => set('footerNote', e.target.value)}
              placeholder="Gracias por su preferencia."
            />
          </div>
          )}
        </div>

        {online && !canUpdateWorkspace && (
          <p className="text-xs text-slate-400">Se requiere el permiso workspace.update para guardar cambios.</p>
        )}

        <Button type="button" onClick={save} disabled={disabled} data-testid="billing-documents-save">
          <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  )
}
