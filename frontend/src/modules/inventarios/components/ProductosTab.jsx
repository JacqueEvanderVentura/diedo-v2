import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  CalendarDays,
  Search,
  Filter,
  ArrowDownToLine,
  AlertTriangle,
} from 'lucide-react'
import { useCatalogStore, LOW_STOCK_THRESHOLD } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProductFormModal } from './ProductFormModal'
import { SalidaMultipleModal } from './SalidaMultipleModal'
import { cn } from '@/lib/utils'

const catName = (categories, id) => categories.find((c) => c.id === id)?.name || id

function stockStatus(p) {
  if (p.type === 'service') return { label: 'Servicio', tone: 'brand' }
  if (p.stock === 0) return { label: 'Agotado', tone: 'neutral' }
  const min = p.minStock ?? LOW_STOCK_THRESHOLD
  if (p.stock <= min) return { label: 'Stock Bajo', tone: 'warning' }
  return { label: 'En Stock', tone: 'success' }
}

export function ProductosTab() {
  const navigate = useNavigate()
  const products = useCatalogStore((s) => s.products)
  const deleteProduct = useCatalogStore((s) => s.deleteProduct)
  const branches = useConfigStore((s) => s.branches)
  const categories = useConfigStore((s) => s.categories)

  const [query, setQuery] = useState('')
  const [branchId, setBranchId] = useState('all')
  const [lowOnly, setLowOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [salidaOpen, setSalidaOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'Todas las Sucursales' }, ...branches.map((b) => ({ value: b.id, label: b.name }))],
    [branches]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      const matchBranch = branchId === 'all' || p.branchId === branchId
      const matchQ = !q || p.name.toLowerCase().includes(q) || (p.sku && String(p.sku).toLowerCase().includes(q))
      const min = p.minStock ?? LOW_STOCK_THRESHOLD
      const matchLow = !lowOnly || (p.type === 'product' && p.stock !== null && p.stock <= min)
      return matchBranch && matchQ && matchLow
    })
  }, [products, query, branchId, lowOnly])

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (p) => {
    setEditing(p)
    setModalOpen(true)
  }
  const handleDelete = (p) => {
    deleteProduct(p.id)
    toast.success(`"${p.name}" eliminado`)
  }

  return (
    <>
      <Card className="overflow-hidden" data-testid="inventory-table">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center">
          <h3 className="font-heading text-lg font-semibold text-slate-900">Lista de Productos</h3>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto..."
                data-testid="inventory-search"
                className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
            </div>
            <Select value={branchId} onChange={setBranchId} options={branchOptions} size="sm" className="min-w-[180px]" data-testid="inventory-branch" />
            <button
              type="button"
              onClick={() => setLowOnly((v) => !v)}
              data-testid="inventory-filter"
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
                lowOnly ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
              )}
            >
              <Filter className="h-4 w-4" /> Filtrar
            </button>
            <button
              type="button"
              onClick={() => setSalidaOpen(true)}
              data-testid="inventory-salida-multiple"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100"
            >
              <ArrowDownToLine className="h-4 w-4" /> Salida Múltiple
            </button>
            <Button onClick={() => navigate('/configuracion/categorias')} data-testid="inventory-catalog-btn" className="shrink-0">
              <Plus className="h-4 w-4" /> Gestionar Catálogo
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Package} title="Sin productos" description="No hay productos con esos filtros." className="py-14" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Categoría</th>
                  <th className="px-5 py-3">Cantidad</th>
                  <th className="px-5 py-3">Stock Mín.</th>
                  <th className="px-5 py-3">Precio</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((p) => {
                  const st = stockStatus(p)
                  const Icon = p.type === 'service' ? CalendarDays : Package
                  const low = p.type === 'product' && p.stock !== null && p.stock <= (p.minStock ?? LOW_STOCK_THRESHOLD)
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-slate-50/60" data-testid={`inventory-row-${p.id}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                            <Icon className="h-4 w-4" />
                          </div>
                          <p className="truncate font-semibold text-slate-800">{p.name}</p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">{p.sku || '—'}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">{catName(categories, p.category)}</td>
                      <td className="px-5 py-4">
                        {p.type === 'service' ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={cn('inline-flex items-center gap-1 font-bold', p.stock === 0 ? 'text-red-500' : low ? 'text-amber-600' : 'text-slate-800')}>
                            {low && p.stock > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                            {p.stock}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">{p.type === 'service' ? '—' : p.minStock ?? 0}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-heading font-bold text-blue-600">{formatDOP(p.price)}</td>
                      <td className="px-5 py-4">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(p)} data-testid={`inventory-edit-${p.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(p)} data-testid={`inventory-delete-${p.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ProductFormModal open={modalOpen} onClose={() => setModalOpen(false)} product={editing} />
      {salidaOpen && <SalidaMultipleModal open branchId={branchId} onClose={() => setSalidaOpen(false)} />}
    </>
  )
}
