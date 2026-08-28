import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'

const UNITS = [
  { value: 'ud', label: 'Unidad (ud)' },
  { value: 'caja', label: 'Caja' },
  { value: 'paq', label: 'Paquete' },
  { value: 'lt', label: 'Litro (lt)' },
  { value: 'kg', label: 'Kilogramo (kg)' },
]

const EMPTY = {
  name: '',
  sku: '',
  price: '',
  cost: '',
  taxPct: 18,
  stock: '',
  minStock: '0',
  category: 'otros',
  type: 'product',
  branchId: 'charm-dn',
  unit: 'ud',
}

export function ProductFormModal({ open, onClose, product, defaultType = 'product' }) {
  const addProduct = useCatalogStore((s) => s.addProduct)
  const updateProduct = useCatalogStore((s) => s.updateProduct)
  const FORM_CATEGORIES = useConfigStore((s) => s.categories)
  const BRANCHES = useConfigStore((s) => s.branches)
  const taxDefault = useConfigStore((s) => s.settings.taxDefault)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const editing = !!product
  const isSupply = form.type === 'supply'
  const isService = form.type === 'service'

  useEffect(() => {
    if (open) {
      setForm(
        product
          ? { ...product, sku: product.sku || '', stock: product.stock ?? '', cost: product.cost ?? '', minStock: product.minStock ?? 0, unit: product.unit || 'ud' }
          : { ...EMPTY, type: defaultType, taxPct: taxDefault ?? 18, category: defaultType === 'supply' ? 'insumos' : 'otros' }
      )
      setErr('')
    }
  }, [open, product, defaultType, taxDefault])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const setType = (type) => {
    setForm((f) => ({
      ...f,
      type,
      category: type === 'supply' ? 'insumos' : f.category === 'insumos' ? 'otros' : f.category,
      price: type === 'supply' ? '' : f.price,
      taxPct: type === 'supply' ? 0 : f.taxPct || taxDefault || 18,
    }))
  }

  const submit = () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre.')
    if (!isSupply && (form.price === '' || Number(form.price) < 0)) return setErr('Ingresa un precio válido.')
    if (isSupply && (form.cost === '' || Number(form.cost) < 0)) return setErr('Ingresa el costo de adquisición.')
    if (!isService && (form.stock === '' || Number(form.stock) < 0)) return setErr('Ingresa el stock.')
    if (editing) {
      updateProduct(product.id, form)
      toast.success(`"${form.name}" actualizado`)
    } else {
      addProduct(form)
      toast.success(`"${form.name}" creado`)
    }
    onClose()
  }

  const title = editing ? 'Editar item' : isSupply ? 'Nuevo insumo' : 'Nuevo item'

  return (
    <Modal open={open} onClose={onClose} title={title} testId="inventory-form-modal">
      <div className="space-y-4">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {[
            { id: 'product', label: 'Producto' },
            { id: 'service', label: 'Servicio' },
            { id: 'supply', label: 'Insumo' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              data-testid={`inventory-type-${t.id}`}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
                form.type === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isSupply && (
          <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
            Los insumos no aparecen en el POS. Solo se gestionan en inventario y salidas manuales.
          </p>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
          <Input value={form.name} onChange={(e) => { set('name', e.target.value); setErr('') }} placeholder={isSupply ? 'Ej. Guantes de nitrilo' : 'Ej. Serum vitamina C'} data-testid="inventory-field-name" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">SKU</label>
            <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder={isSupply ? 'INS-00' : 'PRD-00'} data-testid="inventory-field-sku" />
          </div>
          {isSupply ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Costo adquisición (RD$)</label>
              <Input type="number" value={form.cost} onChange={(e) => { set('cost', e.target.value); setErr('') }} placeholder="0.00" data-testid="inventory-field-cost" />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Precio venta (RD$)</label>
              <Input type="number" value={form.price} onChange={(e) => { set('price', e.target.value); setErr('') }} placeholder="0.00" data-testid="inventory-field-price" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!isSupply && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">ITBIS (%)</label>
              <Input type="number" value={form.taxPct} onChange={(e) => set('taxPct', e.target.value)} placeholder="18" data-testid="inventory-field-tax" />
            </div>
          )}
          {isSupply && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Unidad</label>
              <Select value={form.unit} onChange={(v) => set('unit', v)} options={UNITS} size="sm" data-testid="inventory-field-unit" />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              Stock {isService && <span className="text-slate-400">(N/A)</span>}
            </label>
            <Input type="number" value={isService ? '' : form.stock} onChange={(e) => { set('stock', e.target.value); setErr('') }} placeholder={isService ? '—' : '0'} disabled={isService} data-testid="inventory-field-stock" />
          </div>
        </div>

        {!isService && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Stock mínimo</label>
            <Input type="number" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} placeholder="0" data-testid="inventory-field-min-stock" />
          </div>
        )}

        {!isSupply && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría</label>
            <div className="flex flex-wrap gap-2">
              {FORM_CATEGORIES.filter((c) => c.id !== 'insumos' || isSupply).map((c) => (
                <button
                  key={c.id}
                  onClick={() => set('category', c.id)}
                  data-testid={`inventory-cat-${c.id}`}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.category === c.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label>
          <div className="flex flex-wrap gap-2">
            {BRANCHES.map((b) => (
              <button
                key={b.id}
                onClick={() => set('branchId', b.id)}
                data-testid={`inventory-branch-${b.id}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.branchId === b.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-sm font-medium text-red-500" data-testid="inventory-form-error">{err}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="inventory-form-cancel">Cancelar</Button>
          <Button className="flex-1" onClick={submit} data-testid="inventory-form-save">{editing ? 'Guardar cambios' : 'Crear item'}</Button>
        </div>
      </div>
    </Modal>
  )
}
