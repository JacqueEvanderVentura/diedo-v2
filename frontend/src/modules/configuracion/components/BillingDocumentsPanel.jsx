import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, Save, Trash2 } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { configPageClass } from '../lib/pageShell'
import { DEFAULT_BILLING_DOCUMENTS } from '../lib/billingDocuments'

const MAX_LOGO_BYTES = 512 * 1024

export default function BillingDocumentsPanel({ embedded = false }) {
  const settings = useConfigStore((s) => s.settings)
  const updateBillingDocuments = useConfigStore((s) => s.updateBillingDocuments)
  const fileRef = useRef(null)

  const [draft, setDraft] = useState(() => ({
    ...DEFAULT_BILLING_DOCUMENTS,
    ...(settings.billingDocuments || {}),
  }))

  useEffect(() => {
    setDraft({
      ...DEFAULT_BILLING_DOCUMENTS,
      ...(settings.billingDocuments || {}),
    })
  }, [settings.billingDocuments])

  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))

  const onLogoFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('El logo debe ser una imagen (PNG, JPG, SVG).')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('El logo no puede superar 512 KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      set('logoDataUrl', String(reader.result || ''))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const save = () => {
    updateBillingDocuments(draft)
    toast.success('Datos de cotizaciones y facturas guardados')
  }

  return (
    <div className={embedded ? '' : configPageClass} data-testid="billing-documents-panel">
      <p className="mb-4 text-sm text-slate-600">
        Estos datos aparecen en cotizaciones y facturas (POS y CRM). El logo se guarda en este navegador.
      </p>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            {draft.logoDataUrl ? (
              <img src={draft.logoDataUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImagePlus className="h-8 w-8 text-slate-300" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogoFile} />
            <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              Subir logo
            </Button>
            {draft.logoDataUrl && (
              <Button type="button" size="sm" variant="ghost" onClick={() => set('logoDataUrl', '')}>
                <Trash2 className="h-4 w-4" /> Quitar
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nombre comercial</label>
            <Input
              value={draft.tradeName}
              onChange={(e) => set('tradeName', e.target.value)}
              placeholder={settings.businessName || 'Helios 360'}
              data-testid="billing-trade-name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Razón social</label>
            <Input
              value={draft.legalName}
              onChange={(e) => set('legalName', e.target.value)}
              placeholder="Empresa S.R.L."
              data-testid="billing-legal-name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">RNC</label>
            <Input
              value={draft.rnc}
              onChange={(e) => set('rnc', e.target.value)}
              placeholder="1-3290890-2"
              data-testid="billing-rnc"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Teléfono</label>
            <Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="809-555-0000" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Dirección fiscal</label>
            <Input value={draft.address} onChange={(e) => set('address', e.target.value)} placeholder="Av. …, Santo Domingo" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Correo</label>
            <Input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="facturacion@empresa.com" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Nota al pie (opcional)</label>
            <Input
              value={draft.footerNote}
              onChange={(e) => set('footerNote', e.target.value)}
              placeholder="Gracias por su preferencia."
            />
          </div>
        </div>

        <Button type="button" onClick={save} data-testid="billing-documents-save">
          <Save className="h-4 w-4" /> Guardar cambios
        </Button>
      </div>
    </div>
  )
}
