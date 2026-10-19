import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CreatablePicker } from '@/components/ui/CreatablePicker'
import { useComprasStore } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { useSessionStore } from '@/stores/sessionStore'
import { REQUEST_PRIORITIES } from '@/data/compras'
import { buildBranchFilterOptions } from '@/lib/branches'
import { AttachmentField } from '@/components/ui/AttachmentField'
import { filterCategoriesForSection } from '@/lib/categories'
import { isUuid } from '@/lib/workspaceBranch'
import {
  applyInventorySupplyToRequestItem,
  applySupplierCatalogToRequestItem,
} from '../lib/purchaseRequestExtras'
import {
  COMMON_MEASURE_UNITS,
  loadCustomMeasureUnits,
  mergeMeasureUnits,
} from '../lib/measureUnits'

const emptyItem = () => ({
  name: '',
  qty: 1,
  unit: 'Unidad',
  price: 0,
  catalogItemId: '',
  supplyProductId: '',
  supplyCategoryId: '',
  categoryId: '',
})

export function PurchaseRequestModal({ open, onClose, onSubmit, requesterName = 'Usuario actual' }) {
  const suppliers = useComprasStore((s) => s.suppliers)
  const branches = useConfigStore((s) => s.branches)
  const posBranchId = usePosStore((s) => s.branchId)
  const catalogProducts = useCatalogStore((s) => s.products)
  const supplies = useMemo(
    () => catalogProducts.filter((product) => product.type === 'supply'),
    [catalogProducts]
  )
  const categories = useConfigStore((s) => s.categories)
  const supplyCategories = filterCategoriesForSection(categories, 'catalog', 'insumo')
  const branchOptions = buildBranchFilterOptions(branches, { includeAll: false })
  const [supplierId, setSupplierId] = useState('')
  const [branchId, setBranchId] = useState('charm-dn')
  const [priority, setPriority] = useState('normal')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [quoteAttachments, setQuoteAttachments] = useState([])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [supplierCatalog, setSupplierCatalog] = useState([])
  const fetchSupplierCatalog = useComprasStore((s) => s.fetchSupplierCatalog)
  const isOnline = useSessionStore((s) => s.isOnline())
  const supplierOptions = useMemo(
    () => (isOnline ? suppliers.filter((s) => isUuid(s.id)) : suppliers),
    [suppliers, isOnline],
  )

  useEffect(() => {
    if (!open || !supplierId || !isOnline || !isUuid(supplierId)) {
      setSupplierCatalog([])
      return
    }
    fetchSupplierCatalog(supplierId, { isOnline })
      .then((rows) => setSupplierCatalog(rows))
      .catch(() => setSupplierCatalog([]))
  }, [open, supplierId, isOnline, fetchSupplierCatalog])

  const linkCatalogItem = useCallback((idx, catalogItemId) => {
    const catalogRow = catalogItemId
      ? supplierCatalog.find((row) => row.id === catalogItemId)
      : null
    setItems((list) => list.map((it, i) => (
      i === idx
        ? applySupplierCatalogToRequestItem(it, catalogRow, supplies, supplyCategories)
        : it
    )))
  }, [supplierCatalog, supplies, supplyCategories])

  useEffect(() => {
    if (!open) return
    setSupplierId(supplierOptions[0]?.id || '')
    setBranchId(posBranchId || branches[0]?.id || 'charm-dn')
    setPriority('normal')
    setNotes('')
    setItems([emptyItem()])
    setQuoteAttachments([])
    setErr('')
    setSaving(false)
  }, [open, supplierOptions, posBranchId, branches])

  const linkSupply = (idx, supplyProductId) => {
    const supply = supplyProductId
      ? supplies.find((row) => row.id === supplyProductId)
      : null
    setItems((list) => list.map((it, i) => (
      i === idx ? applyInventorySupplyToRequestItem(it, supply, supplyCategories) : it
    )))
  }

  const unitOptions = useMemo(
    () => mergeMeasureUnits(
      COMMON_MEASURE_UNITS,
      loadCustomMeasureUnits(),
      supplierCatalog.map((row) => row.unit),
      supplies.map((row) => row.unit),
      items.map((row) => row.unit),
    ),
    [supplierCatalog, supplies, items],
  )

  const categoryOptions = useMemo(() => {
    const seen = new Set()
    const options = []
    const push = (id, name) => {
      if (!id || seen.has(id)) return
      seen.add(id)
      options.push({ value: id, label: name || 'Categoría' })
    }
    supplyCategories.forEach((row) => push(row.id, row.name))
    supplierCatalog.forEach((row) => push(row.categoryId, row.categoryName))
    items.forEach((row) => {
      const id = row.supplyCategoryId || row.categoryId
      if (!id || seen.has(id)) return
      const known = categories.find((category) => category.id === id)
      push(id, known?.name)
    })
    return options
  }, [supplyCategories, supplierCatalog, items, categories])

  const updateItem = (idx, field, value) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))

  const addItem = () => setItems((list) => [...list, emptyItem()])
  const removeItem = (idx) => setItems((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== idx)))

  const submit = async () => {
    if (!supplierId) return setErr('Selecciona un proveedor.')
    const validItems = items.filter((i) => i.name.trim())
    if (!validItems.length) return setErr('Agrega al menos un artículo.')
    setSaving(true)
    setErr('')
    try {
      const quoteFile = quoteAttachments[0] || null
      await onSubmit({
        supplierId,
        branchId,
        requesterName,
        items: validItems.map((i) => ({
          ...i,
          qty: Number(i.qty) || 1,
          price: Number(i.price) || 0,
          supplyProductId: i.supplyProductId || null,
          supplyCategoryId: i.supplyCategoryId || i.categoryId || null,
          catalogItemId: i.catalogItemId || null,
          categoryId: i.categoryId || i.supplyCategoryId || null,
        })),
        priority,
        notes: notes.trim(),
        quoteFile,
      })
      toast.success('Solicitud creada')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo crear la solicitud.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva solicitud de compra" xlarge testId="purchase-request-modal">
      {err && <p className="mb-4 text-sm text-red-500">{err}</p>}
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Proveedor *</label>
            <Select
              value={supplierId}
              onChange={setSupplierId}
              placeholder="Seleccionar..."
              options={supplierOptions.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Sucursal</label>
            <Select value={branchId} onChange={setBranchId} options={branchOptions} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Prioridad</label>
            <Select
              value={priority}
              onChange={setPriority}
              options={REQUEST_PRIORITIES.map((p) => ({ value: p, label: p === 'alta' ? 'Alta' : 'Normal' }))}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Artículos</p>
              <p className="mt-0.5 text-xs text-slate-500">Detalla qué se comprará, la cantidad y su precio unitario.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" /> Agregar artículo
            </Button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Artículo {idx + 1}</p>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      aria-label={`Eliminar artículo ${idx + 1}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {supplierCatalog.length > 0 && (
                    <div className="min-w-0 sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-semibold text-slate-500">Del catálogo del proveedor</label>
                      <Select
                        value={item.catalogItemId || ''}
                        onChange={(value) => linkCatalogItem(idx, value)}
                        placeholder="Seleccionar producto del catálogo"
                        options={[
                          { value: '', label: 'Otro / manual' },
                          ...supplierCatalog.map((row) => ({
                            value: row.id,
                            label: `${row.name} · ${row.unit} · RD$${row.unitPrice}`,
                          })),
                        ]}
                      />
                    </div>
                  )}
                  <div className="min-w-0 sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Insumo de inventario</label>
                    <Select
                      value={item.supplyProductId || ''}
                      onChange={(value) => linkSupply(idx, value)}
                      placeholder="Vincular insumo (opcional)"
                      options={[
                        { value: '', label: 'Sin vínculo de inventario' },
                        ...supplies.map((supply) => ({ value: supply.id, label: supply.name })),
                      ]}
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Categoría de insumo</label>
                    <CreatablePicker
                      value={item.supplyCategoryId || item.categoryId || ''}
                      onChange={(value) => setItems((list) => list.map((it, i) => (
                        i === idx ? { ...it, supplyCategoryId: value, categoryId: value } : it
                      )))}
                      options={categoryOptions}
                      placeholder="Categoría"
                      searchPlaceholder="Buscar categoría…"
                      disabled={saving}
                      data-testid={`purchase-request-category-${idx}`}
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_110px_140px_160px]">
                  <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Descripción *</label>
                    <Input
                      placeholder="Ej. Guantes de nitrilo"
                      value={item.name}
                      onChange={(e) => updateItem(idx, 'name', e.target.value)}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Cantidad *</label>
                    <Input
                      type="number"
                      min={1}
                      step="any"
                      value={item.qty}
                      onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Unidad *</label>
                    <CreatablePicker
                      value={item.unit}
                      onChange={(unit) => updateItem(idx, 'unit', unit)}
                      options={unitOptions}
                      placeholder="Unidad"
                      searchPlaceholder="Buscar unidad…"
                      disabled={saving}
                      data-testid={`purchase-request-unit-${idx}`}
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Precio unitario (RD$)</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.price}
                      onChange={(e) => updateItem(idx, 'price', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Cotización del proveedor</label>
          <AttachmentField
            value={quoteAttachments}
            onChange={setQuoteAttachments}
            testId="purchase-quote-attachments"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Detalles adicionales de la solicitud..."
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Creando…' : 'Crear solicitud'}</Button>
      </div>
    </Modal>
  )
}
