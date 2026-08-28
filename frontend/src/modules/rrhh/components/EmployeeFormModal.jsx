import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { DEPARTMENTS } from '@/data/rrhh'

const empty = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  position: '',
  department: 'Operaciones',
  branchId: 'charm-dn',
  contractType: 'Indefinido',
  salary: '',
  vacationDays: '15',
  usuarioId: '',
  jefeId: '',
  clienteId: '',
  active: true,
  hireDate: new Date().toISOString().slice(0, 10),
})

export function EmployeeFormModal({ open, onClose, employee, employees, onSubmit }) {
  const branches = useConfigStore((s) => s.branches)
  const users = useConfigStore((s) => s.users)
  const customers = usePosStore((s) => s.customers)
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const editing = !!employee

  useEffect(() => {
    if (!open) return
    setErr('')
    if (employee) {
      setForm({
        ...empty(),
        ...employee,
        salary: String(employee.salary ?? ''),
        vacationDays: String(employee.vacationDays ?? ''),
        usuarioId: employee.usuarioId || '',
        jefeId: employee.jefeId || '',
        clienteId: employee.clienteId || '',
      })
    } else {
      setForm(empty())
    }
  }, [open, employee])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.firstName.trim()) return setErr('Ingresa el nombre.')
    if (!form.lastName.trim()) return setErr('Ingresa el apellido.')
    if (!form.position.trim()) return setErr('Ingresa el cargo.')
    onSubmit({
      ...form,
      salary: Number(form.salary) || 0,
      vacationDays: Number(form.vacationDays) || 0,
      usuarioId: form.usuarioId || null,
      jefeId: form.jefeId || null,
      clienteId: form.clienteId || null,
    })
    toast.success(editing ? 'Empleado actualizado' : 'Empleado creado')
    onClose()
  }

  const jefeOptions = employees.filter((e) => e.id !== employee?.id).map((e) => ({
    value: e.id,
    label: `${e.firstName} ${e.lastName}`,
  }))

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Empleado' : 'Nuevo Empleado'} wide testId="employee-modal">
      {err && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
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
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Cargo</label>
          <Input value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="Ej. Barbero" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Departamento</label>
          <Select value={form.department} onChange={(v) => set('department', v)} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Sucursal</label>
          <Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Tipo de contrato</label>
          <Input value={form.contractType} onChange={(e) => set('contractType', e.target.value)} placeholder="Indefinido" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Salario (RD$)</label>
          <Input type="number" value={form.salary} onChange={(e) => set('salary', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Días de vacaciones</label>
          <Input type="number" value={form.vacationDays} onChange={(e) => set('vacationDays', e.target.value)} placeholder="15" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Fecha de ingreso</label>
          <Input type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Usuario asignado</label>
          <Select
            value={form.usuarioId}
            onChange={(v) => set('usuarioId', v)}
            placeholder="Sin usuario"
            options={[{ value: '', label: 'Sin usuario' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Jefe directo</label>
          <Select
            value={form.jefeId}
            onChange={(v) => set('jefeId', v)}
            placeholder="Sin jefe"
            options={[{ value: '', label: 'Sin jefe' }, ...jefeOptions]}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Cliente asociado</label>
          <Select
            value={form.clienteId}
            onChange={(v) => set('clienteId', v)}
            placeholder="Sin cliente"
            options={[{ value: '', label: 'Sin cliente' }, ...customers.slice(0, 50).map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            <span className="text-sm font-medium text-slate-700">Empleado activo</span>
          </label>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit}>{editing ? 'Guardar cambios' : 'Crear empleado'}</Button>
      </div>
    </Modal>
  )
}
