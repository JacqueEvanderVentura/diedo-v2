import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useComprasStore } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'
import { filterCategoriesForSection } from '@/lib/categories'
import { formatDOP } from '@/lib/format'
import { useSessionStore } from '@/stores/sessionStore'

const emptyForm = () => ({
  name: '',
  unit: 'unidad',
  unitPrice: '',
  categoryId: '',
})

export function SupplierCatalogPanel({ supplierId }) {
  const fetchSupplierCatalog = useComprasStore((s) => s.fetchSupplierCatalog)
  const saveSupplierCatalogItem = useComprasStore((s) => s.saveSupplierCatalogItem)
  const categories = useConfigStore((s) => s.categories)
  const supplyCategories = filterCategoriesForSection(categories, 'catalog', 'insumo')
  const isOnline = useSessionStore((s) => s.isOnline())

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supplierId || !isOnline) {
      setItems([])
      return
    }
    setLoading(true)
    fetchSupplierCatalog(supplierId, { isOnline })
      .then((rows) => setItems(rows))
      .catch(() => toast.error('No se pudo cargar el catálogo del proveedor'))
      .finally(() => setLoading(false))
  }, [supplierId, isOnline, fetchSupplierCatalog])

  const handleAdd = async () => {
    if (!form.name.trim() || !form.categoryId) {
      toast.error('Completa nombre y categoría')
      return
    }
    setBusy(true)
    try {
      await saveSupplierCatalogItem(
        supplierId,
        {
          name: form.name.trim(),
          unit: form.unit.trim() || 'unidad',
          unitPrice: Number(form.unitPrice) || 0,
          categoryId: form.categoryId,
        },
        { isOnline }
      )
      const rows = await fetchSupplierCatalog(supplierId, { isOnline })
      setItems(rows)
      setForm(emptyForm())
      toast.success('Producto agregado al catálogo')
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar el producto')
    } finally {
      setBusy(false)
    }
  }

  const handleArchive = async (item) => {
    if (!window.confirm(`¿Quitar "${item.name}" del catálogo?`)) return
    setBusy(true)
    try {
      await saveSupplierCatalogItem(
        supplierId,
        { id: item.id, version: item.version, active: false },
        { isOnline }
      )
      const rows = await fetchSupplierCatalog(supplierId, { isOnline })
      setItems(rows)
      toast.success('Producto eliminado del catálogo')
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar')
    } finally {
      setBusy(false)
    }
  }

  if (!isOnline) {
    return (
      <p className="text-sm text-slate-500">
        Conéctate para gestionar el catálogo de precios del proveedor.
      </p>
    )
  }

  const categoryName = (id) => supplyCategories.find((row) => row.id === id)?.name || '—'

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Catálogo de precios</p>
      {loading ? (
        <p className="text-sm text-slate-400">Cargando catálogo…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Sin productos registrados para este proveedor.</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
            >
              <div>
                <p className="font-medium text-slate-800">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {categoryName(item.categoryId)} · {item.unit} · {formatDOP(item.unitPrice)}
                </p>
              </div>
              <button
                type="button"
                className="rounded p-1 text-slate-400 hover:text-red-500"
                onClick={() => handleArchive(item)}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Nombre del producto"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <Select
          value={form.categoryId}
          onChange={(value) => setForm((prev) => ({ ...prev, categoryId: value }))}
          options={supplyCategories.map((row) => ({ value: row.id, label: row.name }))}
          placeholder="Categoría"
        />
        <Input
          placeholder="Unidad"
          value={form.unit}
          onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="Precio"
          value={form.unitPrice}
          onChange={(e) => setForm((prev) => ({ ...prev, unitPrice: e.target.value }))}
        />
      </div>
      <Button size="sm" onClick={handleAdd} disabled={busy}>
        <Plus className="h-4 w-4" /> Agregar al catálogo
      </Button>
    </div>
  )
}
