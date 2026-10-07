import { useEffect, useMemo, useRef, useState } from 'react'
import { Package, Search, Check, ChevronRight } from 'lucide-react'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { formatDOP } from '@/lib/format'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { cn } from '@/lib/utils'

const KIND_TO_TYPES = {
  service: ['service', 'membership'],
  product: ['product'],
  supply: ['supply'],
}

export function CatalogItemPicker({
  itemKind,
  branchId,
  value,
  onChange,
  testIdPrefix = 'income-catalog-picker',
  disabled = false,
}) {
  const products = useCatalogStore((s) => s.products)
  const hydrateFromApi = useCatalogStore((s) => s.hydrateFromApi)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    hydrateFromApi?.().catch(() => {})
  }, [hydrateFromApi])

  useEffect(() => {
    if (!open) return
    function onClick(event) {
      if (btnRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const allowedTypes = KIND_TO_TYPES[itemKind] || []
  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter((product) => isPosSellable(product) || product.type === 'supply')
      .filter((product) => !itemKind || allowedTypes.includes(product.type))
      .filter((product) => {
        if (!branchId) return true
        const ids = product.branchIds || [product.branchId]
        return ids.includes(branchId)
      })
      .filter((product) => {
        if (!q) return true
        return product.name.toLowerCase().includes(q) || String(product.sku || '').toLowerCase().includes(q)
      })
      .slice(0, 80)
  }, [products, itemKind, allowedTypes, branchId, query])

  const selected = value?.id
    ? products.find((product) => product.id === value.id) || value
    : null

  return (
    <div className="relative min-w-0">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        data-testid={`${testIdPrefix}-trigger`}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors',
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-blue-200 hover:bg-blue-50/50'
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          <Package className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold', selected?.name ? 'text-slate-800' : 'text-slate-400')}>
            {selected?.name || 'Buscar en catálogo…'}
          </p>
          {selected?.price != null && (
            <p className="truncate text-xs text-slate-400">{formatDOP(selected.price)}</p>
          )}
        </div>
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')} />
      </button>

      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="start"
        estimatedHeight={320}
        zIndex={120}
        className="p-0"
        data-testid={`${testIdPrefix}-menu`}
      >
        <div className="border-b border-slate-100 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o SKU…"
              data-testid={`${testIdPrefix}-search`}
              className="w-full rounded-lg border-0 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 ring-1 ring-inset ring-transparent placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto p-1.5 scrollbar-thin">
          {options.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Sin artículos en catálogo</p>
          ) : (
            options.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  onChange?.({
                    id: product.id,
                    name: product.name,
                    type: product.type,
                    price: product.price,
                  })
                  setOpen(false)
                  setQuery('')
                }}
                data-testid={`${testIdPrefix}-option-${product.id}`}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{product.name}</p>
                  <p className="text-xs text-slate-400">
                    {product.type === 'service' ? 'Servicio' : product.type === 'product' ? 'Producto' : 'Insumo'}
                    {product.sku ? ` · ${product.sku}` : ''}
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500">{formatDOP(product.price)}</span>
                {selected?.id === product.id && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            ))
          )}
        </div>
      </DropdownPanel>
    </div>
  )
}
