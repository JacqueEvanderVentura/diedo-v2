import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  Image as ImageIcon,
  Landmark,
  Layers,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { cn } from '@/lib/utils'

const ITEM_TYPES = [
  { id: 'product', label: 'Producto' },
  { id: 'service', label: 'Servicio' },
]

const SUBTYPES = [
  { id: 'sale', label: 'Para Venta' },
  { id: 'internal', label: 'Uso Interno' },
]

const UNITS = [
  { id: 'ud', label: 'Unidad (ud)' },
  { id: 'kg', label: 'Kilogramo (kg)' },
  { id: 'lt', label: 'Litro (lt)' },
  { id: 'hr', label: 'Hora (hr)' },
]

function makeEmpty(branchIds, taxDefault) {
  return {
    name: '',
    type: 'product',
    subtype: 'sale',
    category: '',
    sku: '',
    price: '',
    appliesTax: taxDefault > 0,
    cost: '',
    requiresSize: false,
    stock: '0',
    minStock: '0',
    isMembership: false,
    branchIds,
    unit: 'ud',
    allowNegativeStock: false,
    image: null,
  }
}

function Field({ label, className, children, required }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}

function MoneyInput({ value, onChange, testId }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={onChange}
        data-testid={testId}
        className="pl-8"
      />
    </div>
  )
}

function TogglePanel({ checked, onChange, id, tone, icon: Icon, title, description }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/30',
    orange: 'border-orange-100 bg-orange-50/30',
    green: 'border-green-100 bg-green-50/30',
    amber: 'border-amber-100 bg-amber-50/30',
  }
  const iconTones = {
    blue: 'text-blue-600',
    orange: 'text-orange-600',
    green: 'text-green-600',
    amber: 'text-amber-600',
  }

  return (
    <div className={cn('col-span-2 flex items-start gap-3 rounded-xl border p-4', tones[tone])}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <div className="grid gap-1.5 leading-none">
        <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-800">
          {Icon && <Icon className={cn('h-4 w-4', iconTones[tone])} />}
          {title}
        </label>
        {description && <p className="text-xs italic text-slate-500">{description}</p>}
      </div>
    </div>
  )
}

function resolveCategoryId(label, categories) {
  const trimmed = label.trim()
  if (!trimmed) return 'otros'
  const match = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
  return match?.id || 'otros'
}

export function FlashItemModal({ onClose }) {
  const addProduct = useCatalogStore((s) => s.addProduct)
  const addItem = usePosStore((s) => s.addItem)

  const fileRef = useRef(null)
  const [branches, setBranches] = useState([])
  const [taxDefault, setTaxDefault] = useState(18)
  const [form, setForm] = useState(() => makeEmpty([], 18))
  const [err, setErr] = useState('')

  useEffect(() => {
    const { branchId } = usePosStore.getState()
    const { branches: allBranches, settings } = useConfigStore.getState()
    const nextTaxDefault = settings?.taxDefault ?? 18
    const activeBranches = allBranches.filter((b) => b.active !== false)
    const ids = activeBranches.map((b) => b.id)

    setBranches(activeBranches)
    setTaxDefault(nextTaxDefault)
    setForm(makeEmpty(ids.includes(branchId) ? ids : [branchId, ...ids], nextTaxDefault))
    setErr('')
  }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const toggleBranch = (id) => {
    setForm((f) => {
      const has = f.branchIds.includes(id)
      if (has && f.branchIds.length === 1) return f
      return {
        ...f,
        branchIds: has ? f.branchIds.filter((b) => b !== id) : [...f.branchIds, id],
      }
    })
  }

  const handleImage = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set('image', reader.result)
    reader.readAsDataURL(file)
  }

  const submit = () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre del ítem.')
    if (form.price === '' || Number(form.price) < 0) return setErr('Ingresa un precio de venta válido.')
    if (form.type === 'product' && form.stock === '') return setErr('Ingresa el stock actual.')
    if (!form.branchIds.length) return setErr('Selecciona al menos una sucursal.')

    const { branchId } = usePosStore.getState()
    const { categories, settings } = useConfigStore.getState()
    const taxDefault = settings?.taxDefault ?? 18

    const product = addProduct({
      name: form.name.trim(),
      type: form.type,
      subtype: form.subtype,
      category: resolveCategoryId(form.category, categories),
      sku: form.sku.trim() || null,
      price: form.price,
      appliesTax: form.appliesTax,
      taxPct: form.appliesTax ? taxDefault : 0,
      cost: form.cost,
      requiresSize: form.requiresSize,
      stock: form.type === 'service' ? null : form.stock,
      minStock: form.minStock,
      isMembership: form.isMembership,
      branchIds: form.branchIds,
      branchId: form.branchIds.includes(branchId) ? branchId : form.branchIds[0],
      unit: form.unit,
      allowNegativeStock: form.allowNegativeStock,
      image: form.image,
    })

    addItem(product)
    toast.success(`"${product.name}" creado y agregado al carrito`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      testId="pos-flash-item-modal"
      title={
        <div className="flex items-center gap-2 font-heading">
          <div className="rounded-lg bg-blue-50 p-2">
            <Tag className="h-5 w-5 text-blue-600" />
          </div>
          Nuevo Ítem
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre del Ítem" required className="col-span-2">
          <Input
            value={form.name}
            onChange={(e) => {
              set('name', e.target.value)
              setErr('')
            }}
            placeholder="Ej: Café Premium o Consultoría..."
            data-testid="flash-item-name"
          />
        </Field>

        <Field label="Tipo">
          <Select value={form.type} onChange={(v) => set('type', v)} options={ITEM_TYPES} data-testid="flash-item-type" />
        </Field>

        <Field label="Subtipo / Uso">
          <Select value={form.subtype} onChange={(v) => set('subtype', v)} options={SUBTYPES} data-testid="flash-item-subtype" />
        </Field>

        <Field label="Categoría">
          <Input
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Ej: Bebidas, Consultoría..."
            data-testid="flash-item-category"
          />
        </Field>

        <Field label="SKU / Código">
          <Input
            value={form.sku}
            onChange={(e) => set('sku', e.target.value)}
            placeholder="Ej: PRD-001"
            data-testid="flash-item-sku"
          />
        </Field>

        <Field label="Precio de Venta">
          <MoneyInput value={form.price} onChange={(e) => set('price', e.target.value)} testId="flash-item-price" />
          <div className="mt-3 space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.appliesTax}
                onChange={(e) => set('appliesTax', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <Landmark className="h-3.5 w-3.5 text-amber-600" />
              ¿Aplica ITBIS ({taxDefault}%)?
            </label>
          </div>
        </Field>

        <Field label="Costo de Adquisición">
          <MoneyInput value={form.cost} onChange={(e) => set('cost', e.target.value)} testId="flash-item-cost" />
        </Field>

        <TogglePanel
          id="flash-requires-size"
          checked={form.requiresSize}
          onChange={(v) => set('requiresSize', v)}
          tone="blue"
          icon={Tag}
          title="¿Aplica manejo de Tallas (Ropa/Zapatos)?"
          description="Si está activo, el stock total se calculará en base a las tallas definidas."
        />

        <Field label="Stock Actual">
          <Input
            type="number"
            min="0"
            value={form.type === 'service' ? '' : form.stock}
            onChange={(e) => set('stock', e.target.value)}
            disabled={form.type === 'service'}
            placeholder={form.type === 'service' ? '—' : '0'}
            data-testid="flash-item-stock"
          />
        </Field>

        <Field label="Stock Mínimo">
          <Input
            type="number"
            min="0"
            value={form.type === 'service' ? '' : form.minStock}
            onChange={(e) => set('minStock', e.target.value)}
            disabled={form.type === 'service'}
            placeholder={form.type === 'service' ? '—' : '0'}
            data-testid="flash-item-min-stock"
          />
        </Field>

        <TogglePanel
          id="flash-is-membership"
          checked={form.isMembership}
          onChange={(v) => set('isMembership', v)}
          tone="orange"
          icon={Layers}
          title="¿Es este producto una membresía?"
          description="Marca esto si el producto otorga acceso periódico a servicios o beneficios."
        />

        <div className="col-span-2 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Building2 className="h-4 w-4 text-blue-600" />
            Sucursales Disponibles
          </label>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            {branches.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.branchIds.includes(b.id)}
                  onChange={() => toggleBranch(b.id)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {b.name}
              </label>
            ))}
          </div>
        </div>

        <Field label="Unidad de Medida">
          <Select value={form.unit} onChange={(v) => set('unit', v)} options={UNITS} data-testid="flash-item-unit" />
        </Field>

        <TogglePanel
          id="flash-negative-stock"
          checked={form.allowNegativeStock}
          onChange={(v) => set('allowNegativeStock', v)}
          tone="amber"
          icon={AlertTriangle}
          title="Permitir Stock Negativo"
          description="Si está activo, se podrá facturar este producto aunque no tenga stock disponible."
        />

        <div className="col-span-2 space-y-2">
          <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
            <ImageIcon className="h-3 w-3" />
            Imagen del Producto
          </label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-600"
          >
            {form.image ? (
              <img src={form.image} alt="" className="h-full w-full rounded-lg object-cover" />
            ) : (
              <>
                <ImageIcon className="h-6 w-6" />
                <span className="text-[9px]">Subir</span>
              </>
            )}
          </button>
        </div>
      </div>

      {err && (
        <p className="mt-4 text-sm font-medium text-red-500" data-testid="flash-item-error">
          {err}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} data-testid="flash-item-cancel">
          Cancelar
        </Button>
        <Button onClick={submit} className="min-w-[120px]" data-testid="flash-item-save">
          Crear Ítem
        </Button>
      </div>
    </Modal>
  )
}
