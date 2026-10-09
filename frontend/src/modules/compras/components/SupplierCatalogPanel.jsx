import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { CreatablePicker } from '@/components/ui/CreatablePicker'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useComprasStore } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'
import { filterCategoriesForSection } from '@/lib/categories'
import { formatDOP } from '@/lib/format'
import { useSessionStore } from '@/stores/sessionStore'
import { isUuid } from '@/lib/workspaceBranch'
import { catalogApi } from '@/services/catalogApi'
import { mapCategoryFromApi } from '@/services/adapters/catalog'
import {
  COMMON_MEASURE_UNITS,
  loadCustomMeasureUnits,
  mergeMeasureUnits,
  persistCustomMeasureUnit,
} from '../lib/measureUnits'

const emptyForm = () => ({
  name: '',
  unit: 'Unidad',
  unitPrice: '',
  categoryName: '',
})

function matchCategory(name, categories) {
  const needle = name.trim().toLowerCase()
  if (!needle) return null
  return categories.find((row) => row.name.trim().toLowerCase() === needle) || null
}

export function SupplierCatalogPanel({ supplierId }) {
  const fetchSupplierCatalog = useComprasStore((s) => s.fetchSupplierCatalog)
  const saveSupplierCatalogItem = useComprasStore((s) => s.saveSupplierCatalogItem)
  const categories = useConfigStore((s) => s.categories)
  const setCategories = useConfigStore((s) => s.setCategories)
  const addCategory = useConfigStore((s) => s.addCategory)
  const supplyCategories = filterCategoriesForSection(categories, 'catalog', 'insumo')
  const isOnline = useSessionStore((s) => s.isOnline())
  const canManageCatalog = useSessionStore((s) => s.hasPermission('catalog.manage'))

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [busy, setBusy] = useState(false)
  const [customUnits, setCustomUnits] = useState(() => loadCustomMeasureUnits())
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [unitModalOpen, setUnitModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newUnitName, setNewUnitName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [creatingUnit, setCreatingUnit] = useState(false)

  useEffect(() => {
    if (!supplierId || !isOnline) {
      setItems([])
      return
    }
    if (!isUuid(supplierId)) {
      setItems([])
      return
    }
    setLoading(true)
    fetchSupplierCatalog(supplierId, { isOnline })
      .then((rows) => setItems(rows))
      .catch(() => toast.error('No se pudo cargar el catálogo del proveedor'))
      .finally(() => setLoading(false))
  }, [supplierId, isOnline, fetchSupplierCatalog])

  const unitOptions = useMemo(
    () => mergeMeasureUnits(COMMON_MEASURE_UNITS, customUnits, items.map((item) => item.unit)),
    [customUnits, items]
  )
  const categoryOptions = useMemo(
    () => supplyCategories.map((row) => row.name).filter(Boolean),
    [supplyCategories]
  )

  const openCategoryModal = (draft = '') => {
    setNewCategoryName(draft || form.categoryName.trim())
    setCategoryModalOpen(true)
  }

  const openUnitModal = (draft = '') => {
    const typed = (draft || form.unit).trim()
    const exists = unitOptions.some((unit) => unit.toLowerCase() === typed.toLowerCase())
    setNewUnitName(exists ? '' : typed)
    setUnitModalOpen(true)
  }

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) {
      toast.error('Ingresa el nombre de la categoría')
      return
    }
    const existing = matchCategory(name, supplyCategories)
    if (existing) {
      setForm((prev) => ({ ...prev, categoryName: existing.name }))
      setCategoryModalOpen(false)
      return
    }
    setCreatingCategory(true)
    try {
      if (isOnline) {
        const created = await catalogApi.createCategory({
          name,
          categoryKind: 'supply',
        })
        const mapped = mapCategoryFromApi(created, categories.length)
        mapped.type = 'insumo'
        setCategories([...categories.filter((row) => row.id !== mapped.id), mapped])
        setForm((prev) => ({ ...prev, categoryName: mapped.name }))
      } else {
        addCategory({ name, type: 'insumo', active: true })
        const created = useConfigStore.getState().categories.find(
          (row) => row.type === 'insumo' && row.name.trim().toLowerCase() === name.toLowerCase()
        )
        setForm((prev) => ({ ...prev, categoryName: created?.name || name }))
      }
      setCategoryModalOpen(false)
      setNewCategoryName('')
      toast.success('Categoría creada')
    } catch (error) {
      toast.error(error.message || 'No se pudo crear la categoría')
    } finally {
      setCreatingCategory(false)
    }
  }

  const handleCreateUnit = () => {
    const label = newUnitName.trim()
    if (!label) {
      toast.error('Ingresa el nombre de la unidad')
      return
    }
    setCreatingUnit(true)
    try {
      setCustomUnits(persistCustomMeasureUnit(label))
      setForm((prev) => ({ ...prev, unit: label }))
      setUnitModalOpen(false)
      setNewUnitName('')
      toast.success('Unidad agregada')
    } finally {
      setCreatingUnit(false)
    }
  }

  const handleAdd = async () => {
    const category = matchCategory(form.categoryName, supplyCategories)
    if (!form.name.trim() || !category) {
      toast.error('Completa nombre y categoría')
      return
    }
    setBusy(true)
    try {
      await saveSupplierCatalogItem(
        supplierId,
        {
          name: form.name.trim(),
          unit: form.unit.trim() || 'Unidad',
          unitPrice: Number(form.unitPrice) || 0,
          categoryId: category.id,
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
        <CreatablePicker
          value={form.categoryName}
          onChange={(categoryName) => setForm((prev) => ({ ...prev, categoryName }))}
          options={categoryOptions}
          placeholder="Categoría"
          searchPlaceholder="Buscar categoría…"
          createLabel="Crear categoría"
          onCreate={canManageCatalog ? openCategoryModal : undefined}
          disabled={busy}
          data-testid="supplier-catalog-category"
        />
        <CreatablePicker
          value={form.unit}
          onChange={(unit) => setForm((prev) => ({ ...prev, unit }))}
          options={unitOptions}
          placeholder="Unidad"
          searchPlaceholder="Buscar unidad…"
          createLabel="Crear unidad"
          onCreate={openUnitModal}
          disabled={busy}
          data-testid="supplier-catalog-unit"
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

      <Modal
        open={categoryModalOpen}
        onClose={() => { if (!creatingCategory) setCategoryModalOpen(false) }}
        title="Nueva categoría"
        testId="supplier-catalog-category-modal"
      >
        <p className="mb-4 text-sm text-slate-500">
          Se guardará como categoría de insumo para compras e inventario.
        </p>
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
        <Input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="Ej. Químicos, Empaque, Limpieza"
          disabled={creatingCategory}
          data-testid="supplier-catalog-category-name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleCreateCategory()
            }
          }}
        />
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setCategoryModalOpen(false)} disabled={creatingCategory}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleCreateCategory} disabled={creatingCategory} data-testid="supplier-catalog-category-save">
            {creatingCategory ? 'Creando…' : 'Crear categoría'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={unitModalOpen}
        onClose={() => { if (!creatingUnit) setUnitModalOpen(false) }}
        title="Nueva unidad"
        testId="supplier-catalog-unit-modal"
      >
        <p className="mb-4 text-sm text-slate-500">
          Agrégala a la lista para reutilizarla en otros productos de este catálogo.
        </p>
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Unidad de medida</label>
        <Input
          value={newUnitName}
          onChange={(e) => setNewUnitName(e.target.value)}
          placeholder="Ej. Barril, Display, Kit"
          disabled={creatingUnit}
          data-testid="supplier-catalog-unit-name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleCreateUnit()
            }
          }}
        />
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setUnitModalOpen(false)} disabled={creatingUnit}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleCreateUnit} disabled={creatingUnit} data-testid="supplier-catalog-unit-save">
            Crear unidad
          </Button>
        </div>
      </Modal>
    </div>
  )
}
