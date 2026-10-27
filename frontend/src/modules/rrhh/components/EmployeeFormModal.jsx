import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AttachmentField } from '@/components/ui/AttachmentField'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { DEPARTMENTS } from '@/data/rrhh'
import { fullName } from '../lib/rrhh'
import { emptyWorkSchedule, validateWorkSchedule } from '../lib/schedule'
import { EmployeeScheduleEditor } from './EmployeeScheduleEditor'
import { cn } from '@/lib/utils'
import { formatDOP } from '@/lib/format'
import { formatCedulaInput } from '@/modules/agenda/lib/selfBooking'
import { validateCustomerDocument } from '@/lib/customerDocuments'
import { masterDataApi } from '@/services/masterDataApi'

const empty = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  position: '',
  department: 'Operaciones',
  branchIds: [],
  contractType: 'Indefinido',
  documentId: '',
  residenceLocation: '',
  salary: '',
  attachments: [],
  existingContractIds: [],
  usuarioId: '',
  jefeIds: [],
  active: true,
  selectableAsSpecialist: true,
  hireDate: new Date().toISOString().slice(0, 10),
  workSchedule: emptyWorkSchedule(),
})

function mapContractAttachments(items = []) {
  return (items || [])
    .filter((item) => item.classification === 'labor_contract')
    .map((item) => ({
      id: item.id,
      name: item.originalFilename || item.name || 'Contrato',
      contentType: item.contentType || 'application/pdf',
    }))
}

export function createEmployeeFormState(employee = null) {
  if (!employee) return empty()
  return {
    ...empty(),
    ...employee,
    branchIds: employee.branchIds?.length ? employee.branchIds : employee.branchId ? [employee.branchId] : [],
    jefeIds: employee.jefeIds?.length ? employee.jefeIds : employee.jefeId ? [employee.jefeId] : [],
    usuarioId: employee.usuarioId || '',
    documentId: employee.documentId ? formatCedulaInput(employee.documentId) : '',
    residenceLocation: employee.residenceLocation || '',
    salary: employee.salary ? String(employee.salary) : '',
    attachments: employee.attachments || [],
    existingContractIds: (employee.attachments || []).map((item) => item.id).filter(Boolean),
    workSchedule: employee.workSchedule || emptyWorkSchedule(),
  }
}

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

export function EmployeeFormModal({ open, onClose, employee, employees, platformUsers = [], onSubmit }) {
  const branches = useConfigStore((s) => s.branches)
  const demoUsers = useConfigStore((s) => s.users)
  const sessionStatus = useSessionStore((s) => s.status)
  const sessionUser = useSessionStore((s) => s.user)
  const hasPermission = useSessionStore((s) => s.hasPermission)
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!employee
  const canReadHr = hasPermission('hr.profile.read')
  const canManageHr = hasPermission('hr.profile.manage')

  useEffect(() => {
    if (!open) return
    setErr('')
    const next = createEmployeeFormState(employee)
    setForm(next)
    if (!employee?.id || !canReadHr || sessionStatus !== 'online') return undefined
    let cancelled = false
    masterDataApi.employeeAttachments(employee.id)
      .then((items) => {
        if (cancelled) return
        const attachments = mapContractAttachments(items)
        setForm((current) => ({
          ...current,
          attachments,
          existingContractIds: attachments.map((item) => item.id).filter(Boolean),
        }))
      })
      .catch(() => {
        if (!cancelled) toast.error('No se pudieron cargar el contrato existente.')
      })
    return () => { cancelled = true }
  }, [open, employee, canReadHr, sessionStatus])

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
    if (form.documentId.trim()) {
      const documentError = validateCustomerDocument('cedula', form.documentId)
      if (documentError) return setErr(documentError)
    }
    const scheduleErrors = validateWorkSchedule(form.workSchedule)
    if (scheduleErrors.length) return setErr(scheduleErrors.join(' '))
    setSaving(true)
    try {
      const saved = await onSubmit({
        ...form,
        documentType: form.documentId.trim() ? 'cedula' : null,
        documentId: form.documentId.trim() || null,
        usuarioId: form.usuarioId || null,
      })
      if (saved?.attachmentWarning) {
        toast.error(`${editing ? 'Empleado actualizado' : 'Empleado creado'}. ${saved.attachmentWarning}`)
      } else {
        toast.success(editing ? 'Empleado actualizado' : 'Empleado creado')
      }
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
  const linkedUserIds = new Set(
    employees
      .filter((item) => item.id !== employee?.id && item.usuarioId)
      .map((item) => item.usuarioId)
  )
  const onlineUsers = [
    ...platformUsers,
    ...(sessionUser?.userId ? [{ id: sessionUser.userId, name: sessionUser.name }] : []),
    ...(employee?.usuarioId ? [{ id: employee.usuarioId, name: 'Usuario vinculado actual' }] : []),
  ]
  const users = sessionStatus === 'online'
    ? [...new Map(onlineUsers.map((user) => [user.id, user])).values()]
        .filter((user) => !linkedUserIds.has(user.id))
    : demoUsers

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Empleado' : 'Nuevo Empleado'} wide testId="employee-modal">
      {err && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Información personal</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="employee-first-name" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Nombre</label>
              <Input id="employee-first-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Nombre" />
            </div>
            <div>
              <label htmlFor="employee-last-name" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Apellido</label>
              <Input id="employee-last-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Apellido" />
            </div>
            <div>
              <label htmlFor="employee-email" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Email</label>
              <Input id="employee-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="correo@empresa.com" />
            </div>
            <div>
              <label htmlFor="employee-phone" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Teléfono</label>
              <Input id="employee-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="8095550000" />
            </div>
            <div>
              <label htmlFor="employee-hire-date" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Fecha de ingreso</label>
              <Input id="employee-hire-date" type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Departamento</label>
              <Select value={form.department} onChange={(v) => set('department', v)} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
            </div>
            <div>
              <label htmlFor="employee-document-id" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Cédula</label>
              <Input
                id="employee-document-id"
                value={form.documentId}
                onChange={(e) => set('documentId', formatCedulaInput(e.target.value))}
                placeholder="001-1234567-8"
                aria-describedby="employee-document-help"
              />
              <p id="employee-document-help" className="mt-1 text-xs text-slate-500">Documento de identidad. Opcional.</p>
            </div>
            {canReadHr && (
              <div>
                <label htmlFor="employee-residence" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Ubicación de residencia</label>
                {canManageHr ? (
                  <Input
                    id="employee-residence"
                    value={form.residenceLocation}
                    onChange={(e) => set('residenceLocation', e.target.value)}
                    placeholder="Ej. Santo Domingo, DN"
                    aria-describedby="employee-residence-help"
                  />
                ) : (
                  <p id="employee-residence" className="py-3 text-sm text-slate-700">{form.residenceLocation || '—'}</p>
                )}
                <p id="employee-residence-help" className="mt-1 text-xs text-slate-500">Opcional. Ciudad o zona; no hace falta la dirección completa.</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Puesto y sucursales</h3>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="employee-position" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Cargo</label>
              <Input id="employee-position" value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="Ej. Especialista Laser" />
            </div>
            <div>
              <label htmlFor="employee-contract-type" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Tipo de contrato</label>
              <Input id="employee-contract-type" value={form.contractType} onChange={(e) => set('contractType', e.target.value)} placeholder="Indefinido" />
            </div>
            {canReadHr && (
              <div>
                <label htmlFor="employee-salary" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Salario mensual</label>
                {canManageHr ? (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500" aria-hidden="true">RD$</span>
                    <Input
                      id="employee-salary"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      className="pl-12"
                      value={form.salary}
                      onChange={(e) => set('salary', e.target.value)}
                      placeholder="0"
                      aria-describedby="employee-salary-help"
                    />
                  </div>
                ) : (
                  <p id="employee-salary" className="py-3 text-sm text-slate-700">{form.salary ? formatDOP(form.salary) : '—'}</p>
                )}
                <p id="employee-salary-help" className="mt-1 text-xs text-slate-500">Bruto mensual en pesos dominicanos. Opcional.</p>
              </div>
            )}
          </div>
          <label className="mb-2 block text-xs font-semibold uppercase text-slate-400">Sucursales asignadas</label>
          <CheckboxGrid options={branchOptions} selected={form.branchIds} onToggle={toggleBranch} />
          {canReadHr && (
            <div className="mt-4">
              <AttachmentField
                value={form.attachments}
                onChange={(attachments) => set('attachments', attachments)}
                disabled={!canManageHr}
                label="Contrato"
                emptyText="Sin contrato adjunto"
                helpText="PDF o imagen (JPEG, PNG, WebP, GIF). Un solo archivo. Opcional."
                multiple={false}
                maxFiles={1}
                testId="employee-contract-attachment"
              />
            </div>
          )}
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
          <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={form.selectableAsSpecialist}
              onChange={(e) => set('selectableAsSpecialist', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm font-medium text-slate-700">Seleccionable como especialista (agenda en línea)</span>
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
