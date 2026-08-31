import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Building2, Phone, Mail, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardFooter,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { useComprasStore } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'
import { buildBranchFilterOptions, matchesBranch } from '@/lib/branches'
import { Select } from '@/components/ui/Select'
import { SupplierFormModal } from './SupplierFormModal'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'

export function ProveedoresTab() {
  const suppliers = useComprasStore((s) => s.suppliers)
  const addSupplier = useComprasStore((s) => s.addSupplier)
  const updateSupplier = useComprasStore((s) => s.updateSupplier)
  const deleteSupplier = useComprasStore((s) => s.deleteSupplier)
  const branches = useConfigStore((s) => s.branches)
  const isOnline = useSessionStore((s) => s.isOnline())

  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const filteredRaw = useMemo(() => {
    const q = search.trim().toLowerCase()
    return suppliers.filter((s) => {
      if (!matchesBranch(s, branchFilter)) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.rnc?.toLowerCase().includes(q) ||
        s.contactName?.toLowerCase().includes(q)
      )
    })
  }, [suppliers, search, branchFilter])

  const { rows: filtered, sortKey, sortDir, toggleSort } = useSortedRows(filteredRaw, {
    defaultSort: { key: 'name', dir: 'asc' },
    accessors: {
      name: (s) => s.name,
      rnc: (s) => s.rnc || '',
      contact: (s) => s.contactName || '',
      products: (s) => s.productCount ?? 0,
    },
  })

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

  const handleSubmit = async (data) => {
    if (editing) return updateSupplier(editing.id, data, { isOnline })
    return addSupplier(data, { isOnline })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este proveedor?')) return
    try {
      await deleteSupplier(id, { isOnline })
      if (selectedId === id) setSelectedId(null)
      toast.success('Proveedor eliminado')
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar el proveedor')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(280px,1fr)_220px] lg:max-w-3xl">
          <Input
            icon={Search}
            placeholder="Buscar por nombre, RNC o contacto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            value={branchFilter}
            onChange={setBranchFilter}
            options={buildBranchFilterOptions(branches)}
            size="md"
            data-testid="proveedores-branch-filter"
          />
        </div>
        <Button className="w-full shrink-0 sm:w-auto" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Registrar Proveedor
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <EmptyState icon={Building2} title="Sin proveedores" description="No hay proveedores registrados." className="py-12" />
          ) : (
            <ResponsiveList columnCount={5}>
              <ResponsiveTable testId="proveedores-table" wrapCard={false}>
                <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <SortableTh column="name" className="px-4 py-3">Proveedor</SortableTh>
                      <SortableTh column="rnc" className="px-4 py-3">RNC</SortableTh>
                      <SortableTh column="contact" className="px-4 py-3">Contacto</SortableTh>
                      <SortableTh column="products" align="center" className="px-4 py-3">Productos</SortableTh>
                      <SortableTh sortable={false} align="right" className="px-4 py-3">Acciones</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((sup) => (
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
                    ))}
                  </tbody>
                </table>
                </SortableTableProvider>
              </ResponsiveTable>
              <ResponsiveCards testId="proveedores-cards" className="p-4">
                {filtered.map((sup) => (
                  <MobileCard
                    key={sup.id}
                    onClick={() => setSelectedId(sup.id)}
                    testId={`proveedores-card-${sup.id}`}
                    className={selected?.id === sup.id ? 'ring-2 ring-blue-200' : undefined}
                  >
                    <MobileCardHeader title={sup.name} subtitle={sup.rnc ? `RNC: ${sup.rnc}` : undefined} />
                    <MobileCardGrid>
                      <MobileField label="Contacto">{sup.contactName || '—'}</MobileField>
                      <MobileField label="Productos">{sup.productCount ?? 0}</MobileField>
                    </MobileCardGrid>
                    <MobileCardFooter>
                      <span />
                      <div className="flex gap-1">
                        <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(sup) }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(sup.id) }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </MobileCardFooter>
                  </MobileCard>
                ))}
              </ResponsiveCards>
            </ResponsiveList>
          )}
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
