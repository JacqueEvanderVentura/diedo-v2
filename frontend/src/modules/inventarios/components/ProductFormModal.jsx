import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'

const EMPTY = { name: '', sku: '', price: '', taxPct: 18, stock: '', category: 'otros', type: 'product', branchId: 'charm-dn' }

export function ProductFormModal({ open, onClose, product }) {
  const addProduct = useCatalogStore((s) => s.addProduct)
  const updateProduct = useCatalogStore((s) => s.updateProduct)
  const FORM_CATEGORIES = useConfigStore((s) => s.categories)
  const BRANCHES = useConfigStore((s) => s.branches)
  const taxDefault = useConfigStore((s) => s.settings.taxDefault)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const editing = !!product

  useEffect(() => {
    if (open) {
      setForm(product ? { ...product, sku: product.sku || '', stock: product.stock ?? '' } : { ...EMPTY, taxPct: taxDefault ?? 18 })
      setErr('')
    }
  }, [open, product, taxDefault])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre.')
    if (form.price === '' || Number(form.price) < 0) return setErr('Ingresa un precio válido.')
    if (form.type === 'product' && (form.stock === '' || Number(form.stock) < 0)) return setErr('Ingresa el stock (productos).')
    if (editing) {
      updateProduct(product.id, form)
      toast.success(`"${form.name}" actualizado`)
    } else {
      addProduct(form)
      toast.success(`"${form.name}" creado`)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar item' : 'Nuevo item'} testId="inventory-form-modal">
      <div className="space-y-4">
        {/* Type toggle */}
        <div className="flex rounded-xl bg-slate-100 p-1">
          {['product', 'service'].map((t) => (
            <button
              key={t}
              onClick={() => set('type', t)}
              data-testid={`inventory-type-${t}`}
              className={cn('flex-1 rounded-lg py-2 text-sm font-semibold transition-colors', form.type === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}
            >
              {t === 'product' ? 'Producto' : 'Servicio'}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
          <Input value={form.name} onChange={(e) => { set('name', e.target.value); setErr('') }} placeholder="Ej. Serum vitamina C" data-testid="inventory-field-name" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">SKU</label>
            <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="PRD-00" data-testid="inventory-field-sku" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Precio (DOP$)</label>
            <Input type="number" value={form.price} onChange={(e) => { set('price', e.target.value); setErr('') }} placeholder="0.00" data-testid="inventory-field-price" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">ITBIS (%)</label>
            <Input type="number" value={form.taxPct} onChange={(e) => set('taxPct', e.target.value)} placeholder="18" data-testid="inventory-field-tax" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Stock {form.type === 'service' && <span className="text-slate-400">(N/A)</span>}</label>
            <Input type="number" value={form.type === 'service' ? '' : form.stock} onChange={(e) => { set('stock', e.target.value); setErr('') }} placeholder={form.type === 'service' ? '—' : '0'} disabled={form.type === 'service'} data-testid="inventory-field-stock" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Categoría</label>
          <div className="flex flex-wrap gap-2">
            {FORM_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => set('category', c.id)} data-testid={`inventory-cat-${c.id}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.category === c.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label>
          <div className="flex flex-wrap gap-2">
            {BRANCHES.map((b) => (
              <button key={b.id} onClick={() => set('branchId', b.id)} data-testid={`inventory-branch-${b.id}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', form.branchId === b.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200')}>
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
