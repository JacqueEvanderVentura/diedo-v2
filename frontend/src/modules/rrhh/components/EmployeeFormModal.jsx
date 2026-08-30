import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { DEPARTMENTS } from '@/data/rrhh'
import { fullName } from '../lib/rrhh'
import { emptyWorkSchedule } from '../lib/schedule'
import { EmployeeScheduleEditor } from './EmployeeScheduleEditor'
import { cn } from '@/lib/utils'

const empty = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  position: '',
  department: 'Operaciones',
  branchIds: ['charm-dn'],
  contractType: 'Indefinido',
  usuarioId: '',
  jefeIds: [],
  active: true,
  hireDate: new Date().toISOString().slice(0, 10),
  workSchedule: emptyWorkSchedule(),
})

function CheckboxGrid({ options, selected, onToggle }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((opt) => {
        const checked = selected.includes(opt.value)
        return (
          <label
            key={opt.value}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors',
              checked ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'
            )}
          >
            <input type="checkbox" checked={checked} onChange={() => onToggle(opt.value)} className="h-4 w-4 rounded" />
            <span className="font-medium">{opt.label}</span>
          </label>
        )
      })}
    </div>
  )
}

export function EmployeeFormModal({ open, onClose, employee, employees, onSubmit }) {
  const branches = useConfigStore((s) => s.branches)
  const demoUsers = useConfigStore((s) => s.users)
  const sessionStatus = useSessionStore((s) => s.status)
  const sessionUser = useSessionStore((s) => s.user)
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!employee

  useEffect(() => {
    if (!open) return
    setErr('')
    if (employee) {
      setForm({
        ...empty(),
        ...employee,
        branchIds: employee.branchIds?.length ? employee.branchIds : employee.branchId ? [employee.branchId] : ['charm-dn'],
        jefeIds: employee.jefeIds?.length ? employee.jefeIds : employee.jefeId ? [employee.jefeId] : [],
        usuarioId: employee.usuarioId || '',
        workSchedule: employee.workSchedule || emptyWorkSchedule(),
      })
    } else {
      setForm(empty())
    }
  }, [open, employee])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const toggleBranch = (id) => {
    setForm((f) => {
      const next = f.branchIds.includes(id) ? f.branchIds.filter((x) => x !== id) : [...f.branchIds, id]
      return { ...f, branchIds: next.length ? next : [id] }
    })
  }

  const toggleJefe = (id) => {
    setForm((f) => ({
      ...f,
      jefeIds: f.jefeIds.includes(id) ? f.jefeIds.filter((x) => x !== id) : [...f.jefeIds, id],
    }))
  }

  const submit = async () => {
    if (!form.firstName.trim()) return setErr('Ingresa el nombre.')
    if (!form.lastName.trim()) return setErr('Ingresa el apellido.')
    if (!form.position.trim()) return setErr('Ingresa el cargo.')
    if (!form.branchIds.length) return setErr('Selecciona al menos una sucursal.')
    setSaving(true)
    try {
      await onSubmit({
        ...form,
        usuarioId: form.usuarioId || null,
      })
      toast.success(editing ? 'Empleado actualizado' : 'Empleado creado')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el empleado.')
    } finally {
      setSaving(false)
    }
  }

  const jefeOptions = employees
    .filter((e) => e.id !== employee?.id)
    .map((e) => ({ value: e.id, label: fullName(e) }))

  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const users = sessionStatus === 'online'
    ? [
        ...(sessionUser?.userId ? [{ id: sessionUser.userId, name: sessionUser.name }] : []),
        ...(employee?.usuarioId && employee.usuarioId !== sessionUser?.userId
          ? [{ id: employee.usuarioId, name: 'Usuario vinculado actual' }]
          : []),
      ]
    : demoUsers

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Empleado' : 'Nuevo Empleado'} wide testId="employee-modal">
      {err && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Información personal</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Nombre</label>
              <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Nombre" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Apellido</label>
              <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Apellido" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Email</label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="correo@empresa.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Teléfono</label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="8095550000" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Fecha de ingreso</label>
              <Input type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Departamento</label>
              <Select value={form.department} onChange={(v) => set('department', v)} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Puesto y sucursales</h3>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Cargo</label>
              <Input value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="Ej. Especialista Laser" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Tipo de contrato</label>
              <Input value={form.contractType} onChange={(e) => set('contractType', e.target.value)} placeholder="Indefinido" />
            </div>
          </div>
          <label className="mb-2 block text-xs font-semibold uppercase text-slate-400">Sucursales asignadas</label>
          <CheckboxGrid options={branchOptions} selected={form.branchIds} onToggle={toggleBranch} />
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Jerarquía</h3>
          <label className="mb-2 block text-xs font-semibold uppercase text-slate-400">Jefes directos (puede seleccionar varios)</label>
          <CheckboxGrid options={jefeOptions} selected={form.jefeIds} onToggle={toggleJefe} />
        </section>

        <section>
          <EmployeeScheduleEditor
            value={form.workSchedule}
            onChange={(workSchedule) => set('workSchedule', workSchedule)}
          />
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Vínculo de plataforma</h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Usuario asignado</label>
              <Select
                value={form.usuarioId}
                onChange={(v) => set('usuarioId', v)}
                placeholder="Sin usuario"
                options={[{ value: '', label: 'Sin usuario' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
              />
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            <span className="text-sm font-medium text-slate-700">Empleado activo</span>
          </label>
        </section>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear empleado'}
        </Button>
      </div>
    </Modal>
  )
}
