import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Building2, Phone, Mail, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useComprasStore } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'
import { SupplierFormModal } from './SupplierFormModal'
import { cn } from '@/lib/utils'

export function ProveedoresTab() {
  const suppliers = useComprasStore((s) => s.suppliers)
  const addSupplier = useComprasStore((s) => s.addSupplier)
  const updateSupplier = useComprasStore((s) => s.updateSupplier)
  const deleteSupplier = useComprasStore((s) => s.deleteSupplier)
  const branches = useConfigStore((s) => s.branches)

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.rnc?.toLowerCase().includes(q) ||
        s.contactName?.toLowerCase().includes(q)
    )
  }, [suppliers, search])

  const selected = suppliers.find((s) => s.id === selectedId) || filtered[0] || null

  const branchNames = (ids) =>
    (ids || [])
      .map((id) => branches.find((b) => b.id === id)?.name)
      .filter(Boolean)
      .join(', ')

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (sup) => {
    setEditing(sup)
    setModalOpen(true)
  }

  const handleSubmit = (data) => {
    if (editing) updateSupplier(editing.id, data)
    else addSupplier(data)
  }

  const handleDelete = (id) => {
    if (!window.confirm('¿Eliminar este proveedor?')) return
    deleteSupplier(id)
    if (selectedId === id) setSelectedId(null)
    toast.success('Proveedor eliminado')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Registrar Proveedor</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">RNC</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3 text-center">Productos</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No hay proveedores registrados.
                  </td>
                </tr>
              ) : (
                filtered.map((sup) => (
                  <tr
                    key={sup.id}
                    onClick={() => setSelectedId(sup.id)}
                    className={cn(
                      'cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50',
                      selected?.id === sup.id && 'bg-blue-50/60'
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{sup.name}</td>
                    <td className="px-4 py-3 text-slate-600">{sup.rnc || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{sup.contactName || '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{sup.productCount ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(sup) }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(sup.id) }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{selected.name}</h3>
                {selected.rnc && <p className="text-sm text-slate-500">RNC: {selected.rnc}</p>}
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                {selected.contactName && (
                  <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" /> {selected.contactName}</p>
                )}
                {selected.phone && (
                  <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /> {selected.phone}</p>
                )}
                {selected.email && (
                  <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /> {selected.email}</p>
                )}
                {selected.address && (
                  <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> {selected.address}</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Sucursales autorizadas</p>
                <p className="text-sm text-slate-700">{branchNames(selected.branchIds) || 'Ninguna'}</p>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Selecciona un proveedor para ver el detalle.</p>
          )}
        </div>
      </div>

      <SupplierFormModal open={modalOpen} onClose={() => setModalOpen(false)} supplier={editing} onSubmit={handleSubmit} />
    </div>
  )
}
