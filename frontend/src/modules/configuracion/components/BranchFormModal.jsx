import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'fiscal', label: 'Datos Fiscales' },
  { id: 'socios', label: 'Socios' },
]

const empty = () => ({
  name: '',
  address: '',
  phone: '',
  email: '',
  manager: '',
  schedule: '09:00 - 21:00',
  active: true,
  independentBusiness: false,
  legalName: '',
  rnc: '',
  partners: [],
})

export function BranchFormModal({ open, onClose, branch, onSubmit }) {
  const [tab, setTab] = useState('general')
  const [form, setForm] = useState(empty())
  const [partnerName, setPartnerName] = useState('')
  const [partnerShare, setPartnerShare] = useState('')
  const [err, setErr] = useState('')
  const editing = !!branch

  useEffect(() => {
    if (!open) return
    setTab('general')
    setForm(branch ? { ...empty(), ...branch } : empty())
    setPartnerName('')
    setPartnerShare('')
    setErr('')
  }, [open, branch])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const addPartner = () => {
    if (!partnerName.trim()) return
    setForm((f) => ({
      ...f,
      partners: [...(f.partners || []), { name: partnerName.trim(), share: Number(partnerShare) || 0 }],
    }))
    setPartnerName('')
    setPartnerShare('')
  }

  const removePartner = (i) => setForm((f) => ({ ...f, partners: f.partners.filter((_, idx) => idx !== i) }))

  const submit = () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre de la sucursal.')
    if (!form.address.trim()) return setErr('Ingresa la dirección.')
    onSubmit(form)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Sucursal' : 'Nueva Sucursal'} wide testId="sucursal-modal">
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatedTabPanel panelKey={tab}>
      {tab === 'general' && (
        <div className="space-y-3">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre *</label><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre de la sucursal" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Dirección *</label><Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Dirección completa" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono</label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+1 234 567 890" /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Email</label><Input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="sucursal@email.com" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Encargado</label><Input value={form.manager} onChange={(e) => set('manager', e.target.value)} placeholder="Nombre del encargado" /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Horario</label><Input value={form.schedule} onChange={(e) => set('schedule', e.target.value)} placeholder="09:00 - 21:00" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.independentBusiness} onChange={(e) => set('independentBusiness', e.target.checked)} className="rounded border-slate-300" />
            Negocio Independiente
          </label>
        </div>
      )}

      {tab === 'fiscal' && (
        <div className="space-y-3">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Razón Social</label><Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="Nombre legal de la empresa" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">RNC</label><Input value={form.rnc} onChange={(e) => set('rnc', e.target.value)} placeholder="1-3290890-2" /></div>
        </div>
      )}

      {tab === 'socios' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="Nombre del socio" className="flex-1" />
            <Input type="number" value={partnerShare} onChange={(e) => setPartnerShare(e.target.value)} placeholder="%" className="w-20" />
            <Button type="button" variant="secondary" onClick={addPartner}>Agregar</Button>
          </div>
          {(form.partners || []).length === 0 ? (
            <p className="text-sm text-slate-400">Sin socios registrados.</p>
          ) : (
            <ul className="space-y-2">
              {form.partners.map((p, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>{p.name}</span>
                  <span className="flex items-center gap-2 text-slate-500">{p.share}% <button type="button" onClick={() => removePartner(i)} className="text-red-500">×</button></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </AnimatedTabPanel>

      {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

      <div className="mt-4 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1" onClick={submit}>{editing ? 'Guardar' : 'Crear Sucursal'}</Button>
      </div>
    </Modal>
  )
}
