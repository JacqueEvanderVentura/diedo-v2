import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import {
  EMPLOYEE_INCIDENT_KINDS,
  INCIDENCIA_PRIORITIES,
  INCIDENCIA_TYPES,
} from '@/data/incidencias'
import { cn } from '@/lib/utils'
import { currentSessionActor } from '@/lib/sessionActor'

const PRIORITY_OPTIONS = INCIDENCIA_PRIORITIES.map((p) => ({ value: p.id, label: p.name }))
const TYPE_OPTIONS = INCIDENCIA_TYPES.map((t) => ({ value: t.id, label: t.name }))
const EMPLOYEE_INCIDENT_OPTIONS = EMPLOYEE_INCIDENT_KINDS.map((kind) => ({
  value: kind.id,
  label: kind.name,
}))
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_IMAGES = 5

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
    employeeId: '',
    employeeIncidentKind: '',
    description: '',
    images: [],
    intervenientes: [],
  }
}

export function IncidenciaFormModal({
  open,
  onClose,
  onSubmit,
  branches,
  users,
  activos,
  employees = [],
  canAttach = true,
}) {
  const fileRef = useRef(null)
  const [form, setForm] = useState(makeEmpty())
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    const defaultBranch = branches.find((b) => b.active)?.id || branches[0]?.id || ''
    setForm(makeEmpty(defaultBranch))
    setErr('')
    setSubmitting(false)
  }, [open, branches])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const activoOptions = [
    { value: '', label: 'Sin activo relacionado' },
    ...activos
      .filter((a) => a.status === 'activo' && a.branchId === form.branchId)
      .map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
  ]
  const activeUsers = users.filter((u) => u.active)
  const employeeOptions = [
    { value: '', label: 'Seleccionar empleado…' },
    ...employees
      .filter((employee) => employee.active !== false)
      .filter((employee) => (employee.branchIds || [employee.branchId]).includes(form.branchId))
      .map((employee) => ({
        value: employee.id,
        label: `${employee.firstName} ${employee.lastName}`.trim(),
      })),
  ]

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
    if (form.images.length + files.length > MAX_IMAGES) {
      setErr(`Puedes adjuntar un máximo de ${MAX_IMAGES} imágenes.`)
      e.target.value = ''
      return
    }
    const invalid = files.find(
      (file) => !ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES
    )
    if (invalid) {
      setErr('Usa imágenes JPG, PNG, WEBP o GIF de hasta 5 MB cada una.')
      e.target.value = ''
      return
    }
    const readers = files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve({ file, previewUrl: reader.result })
          reader.readAsDataURL(file)
        })
    )
    Promise.all(readers).then((images) => {
      setErr('')
      setForm((current) => ({ ...current, images: [...current.images, ...images] }))
    })
    e.target.value = ''
  }

  const removeImage = (index) => {
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== index) }))
  }

  const submit = async () => {
    if (submitting) return
    if (!form.title.trim()) return setErr('Ingresa el título de la incidencia.')
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    if (form.type === 'personal' && !form.employeeId) {
      return setErr('Selecciona el empleado relacionado.')
    }
    if (form.type === 'personal' && !form.employeeIncidentKind) {
      return setErr('Selecciona la categoría de incidencia laboral.')
    }

    setErr('')
    setSubmitting(true)
    try {
      await onSubmit({
        title: form.title.trim(),
        type: form.type,
        priority: form.priority,
        branchId: form.branchId,
        activoId: form.type === 'activo' && form.activoId ? form.activoId : null,
        employeeId: form.type === 'personal' ? form.employeeId : null,
        employeeName:
          form.type === 'personal'
            ? employeeOptions.find((option) => option.value === form.employeeId)?.label
            : null,
        employeeIncidentKind:
          form.type === 'personal' ? form.employeeIncidentKind : null,
        description: form.description.trim(),
        images: form.images.map((image) => image.previewUrl),
        imageFiles: form.images.map((image) => image.file),
        intervenientes: form.intervenientes,
        reportedBy: currentSessionActor().name,
      })
      toast.success('Incidencia creada correctamente')
      onClose()
    } catch (error) {
      if (error.incidentCreated) {
        toast.warning(error.message)
        onClose()
      } else {
        setErr(error.message || 'No se pudo crear la incidencia.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!submitting) onClose() }}
      title="Nuevo Reporte de Incidencia"
      wide
      testId="incidencia-form-modal"
    >
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
            <Select
              value={form.type}
              onChange={(value) => setForm((current) => ({
                ...current,
                type: value,
                activoId: value === 'activo' ? current.activoId : '',
                employeeId: value === 'personal' ? current.employeeId : '',
                employeeIncidentKind:
                  value === 'personal' ? current.employeeIncidentKind : '',
              }))}
              options={TYPE_OPTIONS}
              disabled={submitting}
              data-testid="incidencia-form-type"
            />
          </Field>
          <Field label="Prioridad">
            <Select value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITY_OPTIONS} disabled={submitting} data-testid="incidencia-form-priority" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Sucursal">
            <Select
              value={form.branchId}
              onChange={(branchId) => setForm((current) => ({
                ...current,
                branchId,
                activoId: '',
                employeeId: '',
              }))}
              options={branchOptions}
              disabled={submitting}
              data-testid="incidencia-form-branch"
            />
          </Field>
          <Field label="Activo relacionado">
            <Select
              value={form.activoId}
              onChange={(v) => set('activoId', v)}
              options={activoOptions}
              disabled={submitting || form.type !== 'activo'}
              data-testid="incidencia-form-activo"
            />
          </Field>
        </div>

        {form.type === 'personal' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Empleado relacionado" required>
              <Select
                value={form.employeeId}
                onChange={(value) => set('employeeId', value)}
                options={employeeOptions}
                disabled={submitting}
                data-testid="incidencia-form-employee"
              />
            </Field>
            <Field label="Categoría laboral" required>
              <Select
                value={form.employeeIncidentKind}
                onChange={(value) => set('employeeIncidentKind', value)}
                options={[
                  { value: '', label: 'Seleccionar categoría…' },
                  ...EMPLOYEE_INCIDENT_OPTIONS,
                ]}
                disabled={submitting}
                data-testid="incidencia-form-employee-kind"
              />
            </Field>
          </div>
        )}

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

        {canAttach && <Field label="Evidencia fotográfica">
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
              {form.images.map((image, i) => (
                <div key={`${image.file.name}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-100">
                  <img src={image.previewUrl} alt={`Vista previa de ${image.file.name}`} className="h-full w-full object-cover" />
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
        </Field>}

        <Field label="Asignar intervinientes">
          <div className="flex flex-wrap gap-2">
            {activeUsers.map((u) => {
              const selected = form.intervenientes.some((i) => i.id === u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleInterviniente(u)}
                  disabled={submitting}
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
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting} data-testid="incidencia-form-submit">
            {submitting ? 'Guardando…' : 'Generar Nuevo Reporte'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
