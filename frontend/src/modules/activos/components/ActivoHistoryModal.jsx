import { useMemo, useState } from 'react'
import { Wrench, AlertTriangle, ZoomIn, Boxes } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ImageLightbox } from '@/modules/pos/components/ProofImagePreview'
import { statusMeta as incidentStatusMeta } from '@/data/incidencias'
import { statusMeta as assetStatusMeta } from '@/stores/activosStore'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function previewItemsFromRecord(record) {
  if (record.attachments?.length) {
    return record.attachments
      .filter((attachment) => attachment.previewObjectUrl || attachment.dataUrl)
      .map((attachment) => ({
        id: attachment.id,
        src: attachment.previewObjectUrl || attachment.dataUrl,
        name: attachment.name,
      }))
  }
  return (record.images || []).map((src, index) => ({
    id: `image-${index}`,
    src,
    name: `Evidencia ${index + 1}`,
  }))
}

export function ActivoHistoryModal({
  open,
  onClose,
  activo,
  incidencias = [],
  mantenimientos = [],
}) {
  const [lightbox, setLightbox] = useState(null)

  const entries = useMemo(() => {
    const incidentEntries = incidencias.map((incident) => ({
      id: `inc-${incident.id}`,
      kind: 'incidencia',
      title: incident.title,
      subtitle: incident.code,
      status: incidentStatusMeta(incident.status).name,
      tone: incidentStatusMeta(incident.status).tone,
      date: incident.updatedAt || incident.createdAt,
      previews: previewItemsFromRecord(incident),
    }))
    const maintenanceEntries = mantenimientos.map((expense) => ({
      id: `mnt-${expense.id}`,
      kind: 'mantenimiento',
      title: expense.concept,
      subtitle: formatDOP(expense.amount),
      status: expense.status === 'pagado' ? 'Pagado' : 'Pendiente',
      tone: expense.status === 'pagado' ? 'success' : 'warning',
      date: expense.date || expense.createdAt,
      previews: previewItemsFromRecord(expense),
    }))
    return [...incidentEntries, ...maintenanceEntries].sort(
      (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
    )
  }, [incidencias, mantenimientos])

  if (!activo) return null
  const assetStatus = assetStatusMeta(activo.status)
  const assetPhoto = previewItemsFromRecord(activo)[0]
  const maintenanceCount = mantenimientos.length
  const incidentCount = incidencias.length

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Detalle del activo"
        testId="activo-history-modal"
        wide
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {assetPhoto ? (
                  <button
                    type="button"
                    onClick={() => setLightbox(assetPhoto)}
                    className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
                    data-testid="activo-history-asset-photo"
                  >
                    <img src={assetPhoto.src} alt={activo.name} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 transition-colors group-hover:bg-slate-900/35">
                      <ZoomIn className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </button>
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400">
                    <Boxes className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-heading text-lg font-semibold text-slate-900">{activo.name}</p>
                  <p className="text-sm text-slate-500">Código: {activo.code || 'N/A'} · {activo.location || 'Sin ubicación'}</p>
                  <p className="mt-1 text-sm font-medium text-slate-700" data-testid="activo-history-maintenance-count">
                    {maintenanceCount} {maintenanceCount === 1 ? 'mantenimiento' : 'mantenimientos'}
                    {incidentCount > 0 ? ` · ${incidentCount} ${incidentCount === 1 ? 'incidencia' : 'incidencias'}` : ''}
                  </p>
                </div>
              </div>
              <Badge tone={assetStatus.tone}>{assetStatus.name}</Badge>
            </div>
          </div>

          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Sin incidencias ni mantenimientos registrados para este activo.
            </p>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-xl border border-slate-100 bg-white p-4 shadow-soft"
                  data-testid={`activo-history-entry-${entry.id}`}
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className={cn(
                        'mt-0.5 flex h-9 w-9 items-center justify-center rounded-full',
                        entry.kind === 'incidencia' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                      )}>
                        {entry.kind === 'incidencia' ? <AlertTriangle className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">{entry.title}</p>
                        <p className="text-xs text-slate-500">
                          {entry.kind === 'incidencia' ? 'Incidencia' : 'Mantenimiento'} · {entry.subtitle}
                        </p>
                        <p className="text-xs text-slate-400">{formatDate(entry.date)}</p>
                      </div>
                    </div>
                    <Badge tone={entry.tone}>{entry.status}</Badge>
                  </div>
                  {entry.previews.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {entry.previews.map((preview) => (
                        <button
                          key={preview.id}
                          type="button"
                          onClick={() => setLightbox(preview)}
                          className="group relative aspect-square overflow-hidden rounded-lg border border-slate-100 bg-slate-50"
                          data-testid={`activo-history-image-${preview.id}`}
                        >
                          <img src={preview.src} alt={preview.name} className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 transition-colors group-hover:bg-slate-900/35">
                            <ZoomIn className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </Modal>
      <ImageLightbox
        open={Boolean(lightbox)}
        src={lightbox?.src}
        alt={lightbox?.name}
        onClose={() => setLightbox(null)}
      />
    </>
  )
}
