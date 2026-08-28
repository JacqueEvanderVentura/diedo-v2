import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Store, Save, MapPin, Phone, Mail, User, Search } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { exportCsv } from '@/modules/finanzas/lib/export'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { BranchFormModal } from '../components/BranchFormModal'

function GeneralSettings() {
  const settings = useConfigStore((s) => s.settings)
  const updateSettings = useConfigStore((s) => s.updateSettings)
  const [form, setForm] = useState(settings)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const save = () => { updateSettings({ ...form, taxDefault: Number(form.taxDefault) || 0 }); toast.success('Ajustes generales guardados') }

  return (
    <Card className="p-6" data-testid="config-general-card">
      <h3 className="mb-4 font-heading text-lg font-bold text-slate-800">Ajustes generales</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre del negocio</label><Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Región</label><Input value={form.region} onChange={(e) => set('region', e.target.value)} /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Impuesto default (%)</label><Input type="number" value={form.taxDefault} onChange={(e) => set('taxDefault', e.target.value)} /></div>
        <div className="flex items-end"><Button className="w-full" onClick={save}><Save className="h-4 w-4" /> Guardar</Button></div>
      </div>
    </Card>
  )
}

export default function SucursalesPage() {
  const branches = useConfigStore((s) => s.branches)
  const addBranch = useConfigStore((s) => s.addBranch)
  const updateBranch = useConfigStore((s) => s.updateBranch)
  const deleteBranch = useConfigStore((s) => s.deleteBranch)

  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const stats = useMemo(() => ({
    total: branches.length,
    activas: branches.filter((b) => b.active).length,
    inactivas: branches.filter((b) => !b.active).length,
  }), [branches])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return branches.filter((b) => !q || b.name.toLowerCase().includes(q) || b.address?.toLowerCase().includes(q))
  }, [branches, query])

  const exportPartners = () => {
    const rows = branches.flatMap((b) =>
      (b.partners || []).map((p) => ({ sucursal: b.name, socio: p.name, participacion: `${p.share}%` }))
    )
    if (!rows.length) return toast.error('No hay socios para exportar')
    exportCsv({ title: 'Reporte de Socios', columns: [{ key: 'sucursal', label: 'Sucursal' }, { key: 'socio', label: 'Socio' }, { key: 'participacion', label: 'Participación' }], rows, filename: 'reporte_socios' })
    toast.success('Reporte exportado')
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <GeneralSettings />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Total Sucursales</p><p className="mt-1 font-heading text-2xl font-bold">{stats.total}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Activas</p><p className="mt-1 font-heading text-2xl font-bold text-emerald-600">{stats.activas}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Inactivas</p><p className="mt-1 font-heading text-2xl font-bold text-slate-400">{stats.inactivas}</p></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar Sucursales..." className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportPartners} data-testid="sucursal-partners-report">Reporte de Socios</Button>
          <Button onClick={() => { setEditing(null); setModalOpen(true) }} data-testid="sucursal-new-btn"><Plus className="h-4 w-4" /> Nueva Sucursal</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {list.map((b) => (
          <Card key={b.id} className="p-5" data-testid={`sucursal-card-${b.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-heading font-bold text-slate-900">{b.name}</h4>
                  <Badge tone={b.active ? 'success' : 'neutral'}>{b.active ? 'Activa' : 'Inactiva'}</Badge>
                  {b.independentBusiness && <Badge tone="warning">Negocio Independiente</Badge>}
                </div>
                {b.legalName && <p className="mt-1 text-xs text-slate-400">{b.legalName}</p>}
                <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                  {b.address && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" />{b.address}</p>}
                  {b.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" />{b.phone}</p>}
                  {b.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0" />{b.email}</p>}
                  <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 shrink-0" />Encargado: {b.manager || 'No asignado'}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>{(b.partners || []).length} Socio(s)</span>
                  {b.rnc && <span>RNC: {b.rnc}</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => updateBranch(b.id, { active: !b.active })} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Store className="h-4 w-4" /></button>
                <button onClick={() => { setEditing(b); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => { if (branches.length <= 1) return toast.error('Debe existir al menos una sucursal'); deleteBranch(b.id); toast.success('Sucursal eliminada') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <BranchFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        branch={editing}
        onSubmit={(data) => {
          if (editing) { updateBranch(editing.id, data); toast.success('Sucursal actualizada') }
          else { addBranch(data); toast.success('Sucursal creada') }
        }}
      />
    </div>
  )
}
