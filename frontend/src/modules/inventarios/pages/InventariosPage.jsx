import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Package, PackageSearch, CalendarDays, AlertTriangle } from 'lucide-react'
import { useCatalogStore, LOW_STOCK_THRESHOLD } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { CategoryBubbles } from '@/modules/pos/components/CategoryBubbles'
import { ProductFormModal } from '../components/ProductFormModal'
import { cn } from '@/lib/utils'

const branchName = (branches, id) => branches.find((b) => b.id === id)?.name || '—'
const catName = (categories, id) => categories.find((c) => c.id === id)?.name || id

function Chip({ label, value, tone }) {
  const tones = { brand: 'text-blue-600', slate: 'text-slate-700', amber: 'text-amber-600' }
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={cn('font-heading text-xl font-bold', tones[tone])}>{value}</p>
    </div>
  )
}

export default function InventariosPage() {
  const products = useCatalogStore((s) => s.products)
  const deleteProduct = useCatalogStore((s) => s.deleteProduct)
  const branches = useConfigStore((s) => s.branches)
  const categories = useConfigStore((s) => s.categories)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      const matchCat = category === 'all' || p.category === category
      const matchQ = !q || p.name.toLowerCase().includes(q) || (p.sku && String(p.sku).toLowerCase().includes(q))
      return matchCat && matchQ
    })
  }, [products, query, category])

  const stats = useMemo(() => {
    const servicios = products.filter((p) => p.type === 'service').length
    const prod = products.filter((p) => p.type === 'product').length
    const low = products.filter((p) => p.type === 'product' && p.stock !== null && p.stock <= LOW_STOCK_THRESHOLD).length
    return { total: products.length, servicios, prod, low }
  }, [products])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (p) => { setEditing(p); setModalOpen(true) }
  const handleDelete = (p) => { deleteProduct(p.id); toast.success(`"${p.name}" eliminado`) }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Chip label="Items totales" value={stats.total} tone="slate" />
        <Chip label="Productos" value={stats.prod} tone="brand" />
        <Chip label="Servicios" value={stats.servicios} tone="slate" />
        <Chip label="Bajo stock" value={stats.low} tone="amber" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <PackageSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            data-testid="inventory-search"
            className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>
        <Button onClick={openNew} data-testid="inventory-new-btn">
          <Plus className="h-4 w-4" /> Nuevo item
        </Button>
      </div>

      <CategoryBubbles active={category} onChange={setCategory} />

      {/* Table */}
      <Card className="overflow-hidden" data-testid="inventory-table">
        {filtered.length === 0 ? (
          <EmptyState icon={PackageSearch} title="Sin items" description="No hay productos/servicios con esos filtros." className="py-14" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Item</th>
                  <th className="px-6 py-4">Categoría</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Sucursal</th>
                  <th className="px-6 py-4 text-right">Precio</th>
                  <th className="px-6 py-4 text-center">Stock</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((p) => {
                  const low = p.type === 'product' && p.stock !== null && p.stock <= LOW_STOCK_THRESHOLD
                  const Icon = p.type === 'service' ? CalendarDays : Package
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-slate-50/60" data-testid={`inventory-row-${p.id}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">{p.name}</p>
                            <p className="text-xs text-slate-400">SKU: {p.sku || 'N/A'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{catName(categories, p.category)}</td>
                      <td className="px-6 py-4">
                        {p.type === 'service' ? <Badge tone="brand">Servicio</Badge> : <Badge tone="neutral">Producto</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{branchName(branches, p.branchId)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-blue-600">{formatDOP(p.price)}</td>
                      <td className="px-6 py-4 text-center">
                        {p.type === 'service' ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={cn('inline-flex items-center gap-1 font-semibold', low ? (p.stock === 0 ? 'text-red-500' : 'text-amber-500') : 'text-slate-700')} data-testid={`inventory-stock-${p.id}`}>
                            {low && <AlertTriangle className="h-3.5 w-3.5" />}
                            {p.stock}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(p)} data-testid={`inventory-edit-${p.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(p)} data-testid={`inventory-delete-${p.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500">
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
    </div>
  )
}
