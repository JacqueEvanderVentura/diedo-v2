import { useRef, useState } from 'react'
import { ImagePlus, Paperclip, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { MentionInput } from '@/components/ui/MentionInput'
import { MentionText } from '@/components/ui/MentionText'
import { initials, priorityMeta, statusMeta, typeMeta, INCIDENCIA_STATUSES } from '@/data/incidencias'
import { cn } from '@/lib/utils'
import { currentSessionActor } from '@/lib/sessionActor'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

const STATUS_OPTIONS = INCIDENCIA_STATUSES.map((s) => ({ value: s.id, label: s.name }))

export function IncidenciaDetail({
  item,
  branchName,
  activoName,
  onStatusChange,
  onComment,
  onAddImages,
  canManage = true,
}) {
  const [comment, setComment] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const fileRef = useRef(null)

  if (!item) {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center rounded-xl border border-slate-100 bg-white shadow-soft">
        <EmptyState title="Selecciona una incidencia" description="Elige un reporte de la lista para ver su detalle." />
      </div>
    )
  }

  const pr = priorityMeta(item.priority)
  const st = statusMeta(item.status)
  const tp = typeMeta(item.type)
  const previewItems = item.attachments?.length
    ? item.attachments
        .filter((attachment) => attachment.previewObjectUrl)
        .map((attachment) => ({
          id: attachment.id,
          src: attachment.previewObjectUrl,
          name: attachment.name,
        }))
    : (item.images || []).map((src, index) => ({ id: `local-${index}`, src, name: `Evidencia ${index + 1}` }))

  const sendComment = async () => {
    if (!comment.trim() || pendingAction) return
    setPendingAction('comment')
    try {
      await onComment(item.id, currentSessionActor().name, comment)
      setComment('')
    } catch (error) {
      toast.error(error.message || 'No se pudo agregar el comentario.')
    } finally {
      setPendingAction(null)
    }
  }

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    e.target.value = ''
    setPendingAction('images')
    try {
      await onAddImages(item.id, files)
      toast.success('Evidencia adjuntada correctamente')
    } catch (error) {
      toast.error(error.message || 'No se pudieron adjuntar las imágenes.')
    } finally {
      setPendingAction(null)
    }
  }

  const changeStatus = async (status) => {
    if (status === item.status || pendingAction) return
    setPendingAction('status')
    try {
      await onStatusChange(item.id, status, currentSessionActor().name)
      toast.success('Estado actualizado')
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar el estado.')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-100 bg-white shadow-soft" data-testid="incidencia-detail">
      <div className="border-b border-slate-100 p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-mono text-xs font-bold text-slate-400">{item.code}</p>
            <h2 className="font-heading text-xl font-bold text-slate-900">{item.title}</h2>
          </div>
          <span className={cn('shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase', pr.className)}>{pr.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={st.tone}>{st.name}</Badge>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{tp.name}</span>
          {branchName && <span className="text-xs text-slate-400">· {branchName}</span>}
          {activoName && <span className="text-xs text-slate-400">· {activoName}</span>}
        </div>
        {item.description && <p className="mt-4 text-sm leading-relaxed text-slate-600">{item.description}</p>}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6 scrollbar-thin">
        {item.intervenientes?.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Intervinientes</h3>
            <div className="flex flex-wrap gap-2">
              {item.intervenientes.map((u) => (
                <div key={u.id} className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-100">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                    {initials(u.name)}
                  </span>
                  <span className="text-xs font-medium text-slate-700">{u.name}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Archivos adjuntos</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={!canManage || Boolean(pendingAction)}
              data-testid="incidencia-add-images"
            >
              <ImagePlus className="h-4 w-4" />
              {pendingAction === 'images' ? 'Subiendo…' : 'Agregar'}
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={handleFiles} />
          </div>
          {previewItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {previewItems.map((preview) => (
                <div key={preview.id} className="aspect-square overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                  <img src={preview.src} alt={`Evidencia: ${preview.name}`} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-sm text-slate-400">
              <Paperclip className="h-4 w-4 shrink-0" />
              Sin evidencia adjunta
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Actividad</h3>
          <div className="space-y-4">
            {item.activity?.map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                  {initials(entry.author)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-800">{entry.author}</span>
                    <span className="text-xs text-slate-400">{formatDate(entry.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">
                    <MentionText text={entry.message} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-3 overflow-visible border-t border-slate-100 p-4 pb-6">
        <div className="flex flex-wrap items-center gap-2 overflow-visible">
          <span className="text-xs font-medium text-slate-500">Cambiar estado:</span>
          <Select
            value={item.status}
            onChange={changeStatus}
            options={STATUS_OPTIONS}
            disabled={!canManage || Boolean(pendingAction)}
            size="sm"
            menuMinWidth={180}
            placement="top"
            className="w-44"
            data-testid="incidencia-status-select"
          />
        </div>
        <div className="flex items-end gap-2">
          <MentionInput
            value={comment}
            onChange={setComment}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendComment())}
            disabled={!canManage || Boolean(pendingAction)}
            placeholder="Escribe un comentario… usa @ para mencionar"
            testId="incidencia-comment-input"
            className="min-h-[88px] rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
          <Button
            onClick={sendComment}
            data-testid="incidencia-comment-send"
            disabled={!canManage || !comment.trim() || Boolean(pendingAction)}
            className="shrink-0 self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
