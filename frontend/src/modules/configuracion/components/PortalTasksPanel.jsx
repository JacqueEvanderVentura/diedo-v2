import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Eye, FileUp, Loader2 } from 'lucide-react'
import { portalTasksApi } from '@/services/portalTasksApi'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { configPageClass } from '../lib/pageShell'

const DEFAULT_TITLE = 'Consentimiento informado'
const DEFAULT_CHECKBOX = 'He leído y acepto los términos y condiciones'

export default function PortalTasksPanel({ embedded }) {
  const fileRef = useRef(null)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [checkboxLabel, setCheckboxLabel] = useState(DEFAULT_CHECKBOX)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    portalTasksApi.listTemplates()
      .then((data) => setTemplates(data.items || []))
      .catch(() => toast.error('No se pudieron cargar las plantillas.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const onPickFile = (event) => {
    const picked = event.target.files?.[0]
    if (!picked) return
    if (picked.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF.')
      return
    }
    setFile(picked)
    event.target.value = ''
  }

  const createTemplate = async () => {
    if (!file) {
      toast.error('Selecciona un PDF.')
      return
    }
    setSaving(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('title', title.trim() || DEFAULT_TITLE)
      form.append('checkboxLabel', checkboxLabel.trim() || DEFAULT_CHECKBOX)
      form.append('isDefaultForAll', 'true')
      await portalTasksApi.createTemplate(form)
      toast.success('Plantilla creada.')
      setFile(null)
      setTitle(DEFAULT_TITLE)
      setCheckboxLabel(DEFAULT_CHECKBOX)
      reload()
    } catch (error) {
      toast.error(error.message || 'No se pudo crear la plantilla.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (template) => {
    try {
      await portalTasksApi.updateTemplate(template.id, { isActive: !template.isActive })
      reload()
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar.')
    }
  }

  const openPreview = async (template) => {
    setPreview({ title: template.title, blobUrl: null })
    setPreviewLoading(true)
    try {
      const blob = await portalTasksApi.templatePdfBlob(template.id)
      const blobUrl = URL.createObjectURL(blob)
      setPreview({ title: template.title, blobUrl })
    } catch (error) {
      toast.error(error.message || 'No se pudo abrir el PDF.')
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const closePreview = () => {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
    setPreviewLoading(false)
  }

  return (
    <div className={embedded ? 'space-y-6' : configPageClass}>
      <div>
        <h2 className="font-heading text-lg font-bold text-slate-900">Tareas del portal del cliente</h2>
        <p className="mt-1 text-sm text-slate-500">
          Documentos que cada cliente debe leer y aceptar en el portal (por ejemplo consentimiento informado).
        </p>
      </div>

      <Card className="space-y-4 p-4" data-testid="portal-tasks-create">
        <p className="text-sm font-semibold text-slate-800">Nueva plantilla</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            data-testid="portal-task-title"
          />
          <Input
            value={checkboxLabel}
            onChange={(e) => setCheckboxLabel(e.target.value)}
            placeholder="Texto de la casilla"
            data-testid="portal-task-checkbox-label"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPickFile} />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" /> {file ? file.name : 'Elegir PDF'}
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={createTemplate} data-testid="portal-task-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Publicar para todos los clientes
          </Button>
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando plantillas…</p>
      ) : (
        <ul className="space-y-3" data-testid="portal-tasks-list">
          {templates.length === 0 ? (
            <li className="text-sm text-slate-400">Aún no hay plantillas activas en el portal.</li>
          ) : templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{template.title}</p>
                <p className="truncate text-xs text-slate-500">{template.checkboxLabel}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {template.isDefaultForAll ? <Badge tone="brand">Todos los clientes</Badge> : null}
                  <Badge tone={template.isActive ? 'success' : 'neutral'}>
                    {template.isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => openPreview(template)}>
                  <Eye className="h-4 w-4" /> PDF
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => toggleActive(template)}>
                  {template.isActive ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={preview !== null} onClose={closePreview} title={preview?.title || 'Documento'} wide>
        {previewLoading ? (
          <p className="py-8 text-center text-sm text-slate-500">Cargando PDF…</p>
        ) : null}
        {preview?.blobUrl ? (
          <iframe
            title={preview.title}
            src={preview.blobUrl}
            className="h-[min(70vh,32rem)] w-full rounded-xl border border-slate-200"
          />
        ) : null}
      </Modal>
    </div>
  )
}