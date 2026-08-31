import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useActivosStore, ACTIVO_STATUSES } from '@/stores/activosStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { buildBranchFilterOptions } from '@/lib/branches'
import { cn } from '@/lib/utils'

const EMPTY = { name: '', code: '', category: 'mobiliario', value: '', status: 'activo', location: '', branchId: 'charm-dn', purchaseDate: '', notes: '' }

export function ActivoFormModal({ open, onClose, activo }) {
  const saveActivo = useActivosStore((s) => s.saveActivo)
  const categories = useActivosStore((s) => s.categories)
  const branches = useConfigStore((s) => s.branches)
  const isOnline = useSessionStore((s) => s.isOnline())
  const branchOptions = buildBranchFilterOptions(branches, { includeAll: false })
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!activo

  useEffect(() => {
    if (open) {
      setForm(
        activo
          ? { ...activo, code: activo.code || '', value: activo.value ?? '' }
          : {
              ...EMPTY,
              category: categories[0]?.id || EMPTY.category,
              branchId: branches[0]?.id || '',
            }
      )
      setErr('')
      setSaving(false)
    }
  }, [open, activo, branches, categories])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre del activo.')
    if (form.value === '' || Number(form.value) < 0) return setErr('Ingresa un valor válido.')
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    setSaving(true)
    try {
      await saveActivo(form, activo, { isOnline })
      toast.success(`"${form.name}" ${editing ? 'actualizado' : 'registrado'}`)
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el activo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar activo' : 'Nuevo activo'} testId="activo-form-modal">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
          <Input value={form.name} onChange={(e) => { set('name', e.target.value); setErr('') }} placeholder="Ej. Silla ergonómica" data-testid="activo-field-name" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Código / Serie</label>
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="MOB-001" data-testid="activo-field-code" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Valor (RD$)</label>
            <Input type="number" value={form.value} onChange={(e) => { set('value', e.target.value); setErr('') }} placeholder="0.00" data-testid="activo-field-value" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Ubicación</label>
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Ej. Recepción" data-testid="activo-field-location" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label>
            <Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branchOptions} data-testid="activo-field-branch" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha de compra</label>
          <Input type="date" value={form.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} data-testid="activo-field-date" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button key={c.id} onClick={() => set('category', c.id)} data-testid={`activo-cat-${c.id}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.category === c.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Estado</label>
          <div className="flex flex-wrap gap-2">
            {ACTIVO_STATUSES.map((st) => (
              <button key={st.id} onClick={() => set('status', st.id)} data-testid={`activo-status-${st.id}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.status === st.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
                {st.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Notas <span className="text-slate-400">(opcional)</span></label>
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Detalles adicionales" data-testid="activo-field-notes" />
        </div>

        {err && <p role="alert" className="text-sm font-medium text-red-500" data-testid="activo-form-error">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="activo-form-cancel">Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={saving} data-testid="activo-form-save">
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar activo'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
