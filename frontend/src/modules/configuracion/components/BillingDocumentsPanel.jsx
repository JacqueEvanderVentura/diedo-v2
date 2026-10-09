import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ImagePlus, Plus, Save, Trash2 } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { administrationGateway } from '@/services/administrationApi'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { configPageClass } from '../lib/pageShell'
import {
  assignBranchToTemplate,
  createDefaultBillingTemplate,
  normalizeBillingDocumentsState,
} from '../lib/billingDocuments'
import { isSettingsBlockVisible } from '../lib/settingsSearch'
import {
  mapWorkspaceSettingsFromApi,
  workspaceBillingDocumentsPatchToApi,
} from '../lib/workspaceSettings'
import { cn } from '@/lib/utils'

const MAX_LOGO_BYTES = 1024 * 1024

function mergeBillingDraft(source) {
  return normalizeBillingDocumentsState(source)
}

function BillingTemplateFields({
  template,
  branches,
  disabled,
  onChange,
  visibleBlockIds,
}) {
  const fileRef = useRef(null)
  const set = (key, value) => onChange({ ...template, [key]: value })

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

  return (
    <div className="space-y-4 pt-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Nombre de la plantilla</label>
        <Input
          value={template.name}
          disabled={disabled}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Ej. Sucursal norte"
          data-testid={`billing-template-name-${template.id}`}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Sucursales</label>
        <BranchMultiSelect
          branches={branches}
          branchIds={template.branchIds || []}
          onChange={(branchIds) => onChange({ ...template, branchIds })}
          disabled={disabled}
          testId={`billing-template-branches-${template.id}`}
        />
        <p className="mt-1 text-xs text-slate-400">
          Vacío = todas las sucursales. Si asignas sucursales, solo esta plantilla las usará.
        </p>
      </div>

      {isSettingsBlockVisible(visibleBlockIds, 'logo') && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-28 min-w-[12rem] max-w-full flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 sm:max-w-md">
            {template.logoDataUrl ? (
              <img
                src={template.logoDataUrl}
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
            {template.logoDataUrl && (
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
              value={template.tradeName}
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
              value={template.legalName}
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
              value={template.rnc}
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
            <Input value={template.phone} disabled={disabled} onChange={(e) => set('phone', e.target.value)} placeholder="809-555-0000" />
          </div>
        )}
        {isSettingsBlockVisible(visibleBlockIds, 'address') && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Dirección fiscal</label>
            <Input value={template.address} disabled={disabled} onChange={(e) => set('address', e.target.value)} placeholder="Av. …, Santo Domingo" />
          </div>
        )}
        {isSettingsBlockVisible(visibleBlockIds, 'email') && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Correo</label>
            <Input type="email" value={template.email} disabled={disabled} onChange={(e) => set('email', e.target.value)} placeholder="facturacion@empresa.com" />
          </div>
        )}
        {isSettingsBlockVisible(visibleBlockIds, 'footer') && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Nota al pie (opcional)</label>
            <Input
              value={template.footerNote}
              disabled={disabled}
              onChange={(e) => set('footerNote', e.target.value)}
              placeholder="Gracias por su preferencia."
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function BillingDocumentsPanel({ embedded = false, visibleBlockIds }) {
  const allBranches = useConfigStore((s) => s.branches)
  const branches = useMemo(
    () => allBranches.filter((branch) => branch.active !== false),
    [allBranches],
  )
  const settings = useConfigStore((s) => s.settings)
  const updateBillingDocuments = useConfigStore((s) => s.updateBillingDocuments)
  const updateSettings = useConfigStore((s) => s.updateSettings)
  const online = useSessionStore((state) => state.status === 'online')
  const canReadWorkspace = useSessionStore((state) => state.hasPermission('workspace.read'))
  const canUpdateWorkspace = useSessionStore((state) => state.hasPermission('workspace.update'))

  const [draft, setDraft] = useState(() => mergeBillingDraft({}))
  const [openTemplateIds, setOpenTemplateIds] = useState(() => new Set())
  const [ready, setReady] = useState(() => !online)
  const [loading, setLoading] = useState(() => online && canReadWorkspace)
  const [saving, setSaving] = useState(false)

  const templates = draft.templates || []
  const singleTemplate = templates.length === 1

  const syncOpenTemplates = useCallback((state) => {
    if (state.templates.length !== 1) return
    const onlyId = state.templates[0].id
    setOpenTemplateIds((prev) => {
      if (prev.size === 1 && prev.has(onlyId)) return prev
      return new Set([onlyId])
    })
  }, [])

  const applyBillingDocuments = useCallback((billingDocuments, version) => {
    const merged = mergeBillingDraft(billingDocuments)
    setDraft(merged)
    updateBillingDocuments(merged)
    syncOpenTemplates(merged)
    if (version != null) {
      updateSettings({ version })
    }
  }, [syncOpenTemplates, updateBillingDocuments, updateSettings])

  const load = useCallback(async () => {
    if (!online) {
      const local = mergeBillingDraft(useConfigStore.getState().settings.billingDocuments)
      setDraft(local)
      syncOpenTemplates(local)
      setReady(true)
      return
    }
    if (!canReadWorkspace) {
      const local = mergeBillingDraft(useConfigStore.getState().settings.billingDocuments)
      setDraft(local)
      syncOpenTemplates(local)
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
      const local = mergeBillingDraft(useConfigStore.getState().settings.billingDocuments)
      setDraft(local)
      syncOpenTemplates(local)
    } finally {
      setLoading(false)
      setReady(true)
    }
  }, [applyBillingDocuments, canReadWorkspace, online, syncOpenTemplates])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const updateTemplate = (templateId, nextTemplate) => {
    setDraft((current) => {
      const withBranches = assignBranchToTemplate(
        current.templates,
        templateId,
        nextTemplate.branchIds,
      )
      return {
        templates: withBranches.map((template) => (
          template.id === templateId ? { ...template, ...nextTemplate } : template
        )),
      }
    })
  }

  const addTemplate = () => {
    const next = createDefaultBillingTemplate({
      name: `Plantilla ${templates.length + 1}`,
    })
    setDraft((current) => ({
      templates: [...current.templates, next],
    }))
    setOpenTemplateIds(new Set([next.id]))
  }

  const removeTemplate = (templateId) => {
    if (templates.length <= 1) {
      toast.error('Debe existir al menos una plantilla.')
      return
    }
    setDraft((current) => ({
      templates: current.templates.filter((template) => template.id !== templateId),
    }))
    setOpenTemplateIds((prev) => {
      const next = new Set(prev)
      next.delete(templateId)
      return next
    })
  }

  const toggleTemplate = (templateId) => {
    if (singleTemplate) return
    setOpenTemplateIds((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) next.delete(templateId)
      else next.add(templateId)
      return next
    })
  }

  const save = async () => {
    if (saving || (online && !canUpdateWorkspace)) return
    if (!draft.templates?.length) {
      toast.error('Debe existir al menos una plantilla.')
      return
    }
    const missingName = draft.templates.find((template) => !template.name?.trim())
    if (missingName) {
      toast.error('Cada plantilla necesita un nombre.')
      return
    }
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
        Crea plantillas de branding para cotizaciones y facturas (POS y CRM) y asígnalas a sucursales.
        {online ? ' Se guardan en el workspace y se sincronizan entre dispositivos.' : ' Modo demo: se guardan en esta sesión.'}
      </p>

      {!ready && (
        <p className="mb-4 text-sm text-slate-500" data-testid="billing-documents-loading">
          Cargando datos de facturación…
        </p>
      )}

      <div className={ready ? 'space-y-4' : 'hidden'} aria-hidden={!ready}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-heading text-base font-bold text-slate-800">Plantillas</h3>
          <Button type="button" size="sm" onClick={addTemplate} disabled={disabled} data-testid="billing-template-add">
            <Plus className="h-4 w-4" /> Nueva plantilla
          </Button>
        </div>

        <div className="space-y-3">
          {templates.map((template) => {
            const isOpen = singleTemplate || openTemplateIds.has(template.id)
            return (
              <Card key={template.id} className="overflow-hidden" data-testid={`billing-template-card-${template.id}`}>
                <div
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-4 py-3',
                    !singleTemplate && 'hover:bg-slate-50',
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      'min-w-0 flex-1 text-left',
                      singleTemplate ? 'cursor-default' : 'cursor-pointer',
                    )}
                    onClick={() => toggleTemplate(template.id)}
                    disabled={singleTemplate}
                    aria-expanded={isOpen}
                  >
                    <p className="truncate font-semibold text-slate-800">{template.name || 'Sin nombre'}</p>
                    <p className="text-xs text-slate-500">
                      {template.branchIds?.length
                        ? `${template.branchIds.length} sucursal(es)`
                        : 'Todas las sucursales'}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled || templates.length <= 1}
                      onClick={() => removeTemplate(template.id)}
                      data-testid={`billing-template-remove-${template.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {!singleTemplate && (
                      <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 pb-4">
                    <BillingTemplateFields
                      template={template}
                      branches={branches}
                      disabled={disabled}
                      visibleBlockIds={visibleBlockIds}
                      onChange={(next) => updateTemplate(template.id, next)}
                    />
                  </div>
                )}
              </Card>
            )
          })}
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
