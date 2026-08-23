import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, UserCog } from 'lucide-react'
import { useConfigStore, USER_ROLES } from '@/stores/configStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

const ROLE_TONE = { Administrador: 'brand', Gerente: 'success', Cajero: 'warning', Recepción: 'neutral' }
const EMPTY = { name: '', email: '', role: 'Cajero', active: true }

export default function UsuariosPage() {
  const users = useConfigStore((s) => s.users)
  const addUser = useConfigStore((s) => s.addUser)
  const updateUser = useConfigStore((s) => s.updateUser)
  const deleteUser = useConfigStore((s) => s.deleteUser)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')

  useEffect(() => { if (modalOpen) { setForm(editing ? { ...editing } : EMPTY); setErr('') } }, [modalOpen, editing])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (u) => { setEditing(u); setModalOpen(true) }
  const submit = () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre.')
    if (editing) { updateUser(editing.id, form); toast.success('Usuario actualizado') }
    else { addUser(form); toast.success('Usuario creado') }
    setModalOpen(false)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 sm:p-8">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        <UserCog className="h-4 w-4 shrink-0" /> Roles de referencia (mock). Permisos granulares en una fase posterior.
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold text-slate-800">Usuarios</h3>
        <Button onClick={openNew} data-testid="usuario-new-btn"><Plus className="h-4 w-4" /> Nuevo usuario</Button>
      </div>

      <Card className="overflow-hidden" data-testid="usuarios-table">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Rol</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60" data-testid={`usuario-row-${u.id}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{u.name.slice(0, 1).toUpperCase()}</div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{u.name}</p>
                        <p className="text-xs text-slate-400">{u.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4"><Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</Badge></td>
                  <td className="px-6 py-4">
                    <button onClick={() => updateUser(u.id, { active: !u.active })} data-testid={`usuario-toggle-${u.id}`}>
                      <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(u)} data-testid={`usuario-edit-${u.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => { deleteUser(u.id); toast.success('Usuario eliminado') }} data-testid={`usuario-delete-${u.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar usuario' : 'Nuevo usuario'} testId="usuario-modal">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
            <Input value={form.name} onChange={(e) => { set('name', e.target.value); setErr('') }} placeholder="Ej. Juan Pérez" data-testid="usuario-field-name" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Email</label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="usuario@negocio.com" data-testid="usuario-field-email" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Rol</label>
            <div className="flex flex-wrap gap-2">
              {USER_ROLES.map((r) => (
                <button key={r} onClick={() => set('role', r)} data-testid={`usuario-role-${r}`}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.role === r ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="text-sm font-medium text-red-500">{err}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)} data-testid="usuario-cancel">Cancelar</Button>
            <Button className="flex-1" onClick={submit} data-testid="usuario-save">{editing ? 'Guardar' : 'Crear'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
