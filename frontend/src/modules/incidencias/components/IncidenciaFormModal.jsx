import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { CURRENT_USER } from '@/data/dashboard'
import { INCIDENCIA_PRIORITIES, INCIDENCIA_TYPES } from '@/data/incidencias'
import { useConfigStore } from '@/stores/configStore'
import { useActivosStore } from '@/stores/activosStore'
import { cn } from '@/lib/utils'

const PRIORITY_OPTIONS = INCIDENCIA_PRIORITIES.map((p) => ({ value: p.id, label: p.name }))
const TYPE_OPTIONS = INCIDENCIA_TYPES.map((t) => ({ value: t.id, label: t.name }))

function Field({ label, className, children, required }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}

function makeEmpty(branchId) {
  return {
    title: '',
    type: 'activo',
    priority: 'media',
    branchId: branchId || '',
    activoId: '',
    description: '',
    images: [],
    intervenientes: [],
  }
}

export function IncidenciaFormModal({ open, onClose, onSubmit }) {
  const fileRef = useRef(null)
  const [form, setForm] = useState(makeEmpty())
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    const { branches } = useConfigStore.getState()
    const defaultBranch = branches.find((b) => b.active)?.id || branches[0]?.id || ''
    setForm(makeEmpty(defaultBranch))
    setErr('')
  }, [open])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const { branches, users } = useConfigStore.getState()
  const activos = useActivosStore.getState().activos

  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const activoOptions = [
    { value: '', label: 'Sin activo relacionado' },
    ...activos.filter((a) => a.status !== 'baja').map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
  ]
  const activeUsers = users.filter((u) => u.active)

  const toggleInterviniente = (user) => {
    setForm((f) => {
      const has = f.intervenientes.some((i) => i.id === user.id)
      return {
        ...f,
        intervenientes: has
          ? f.intervenientes.filter((i) => i.id !== user.id)
          : [...f.intervenientes, { id: user.id, name: user.name }],
      }
    })
  }

  const handleImages = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const readers = files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.readAsDataURL(file)
        })
    )
    Promise.all(readers).then((urls) => setForm((f) => ({ ...f, images: [...f.images, ...urls] })))
    e.target.value = ''
  }

  const removeImage = (index) => {
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== index) }))
  }

  const submit = () => {
    if (!form.title.trim()) return setErr('Ingresa el título de la incidencia.')
    if (!form.branchId) return setErr('Selecciona una sucursal.')

    onSubmit({
      title: form.title.trim(),
      type: form.type,
      priority: form.priority,
      branchId: form.branchId,
      activoId: form.type === 'activo' && form.activoId ? form.activoId : null,
      description: form.description.trim(),
      images: form.images,
      intervenientes: form.intervenientes,
      reportedBy: CURRENT_USER.name,
    })
    toast.success('Incidencia creada correctamente')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo Reporte de Incidencia" wide testId="incidencia-form-modal">
      <div className="space-y-5">
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

        <Field label="Título" required>
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Describe brevemente el problema"
            data-testid="incidencia-form-title"
            className="w-full rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <Select value={form.type} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} data-testid="incidencia-form-type" />
          </Field>
          <Field label="Prioridad">
            <Select value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITY_OPTIONS} data-testid="incidencia-form-priority" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Sucursal">
            <Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branchOptions} data-testid="incidencia-form-branch" />
          </Field>
          <Field label="Activo relacionado">
            <Select
              value={form.activoId}
              onChange={(v) => set('activoId', v)}
              options={activoOptions}
              disabled={form.type !== 'activo'}
              data-testid="incidencia-form-activo"
            />
          </Field>
        </div>

        <Field label="Descripción">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={4}
            placeholder="Detalles adicionales del reporte..."
            data-testid="incidencia-form-description"
            className="w-full resize-none rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </Field>

        <Field label="Evidencia fotográfica">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-sm text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
            data-testid="incidencia-form-images-trigger"
          >
            <ImageIcon className="h-8 w-8 text-slate-300" />
            Haz clic para subir imágenes
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImages} />
          {form.images.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {form.images.map((src, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-100">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>

        <Field label="Asignar intervinientes">
          <div className="flex flex-wrap gap-2">
            {activeUsers.map((u) => {
              const selected = form.intervenientes.some((i) => i.id === u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleInterviniente(u)}
                  data-testid={`incidencia-form-user-${u.id}`}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors',
                    selected ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'
                  )}
                >
                  {u.name}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} data-testid="incidencia-form-submit">
            Generar Nuevo Reporte
          </Button>
        </div>
      </div>
    </Modal>
  )
}
