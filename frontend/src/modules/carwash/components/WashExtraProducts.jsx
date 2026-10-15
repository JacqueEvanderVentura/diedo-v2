import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { posApi } from '@/services/posApi'
import { mapPosStateFromApi } from '@/services/adapters/pos'
import { formatDOP } from '@/lib/format'

export function WashExtraProducts({ branchId, extras, onChange, disabled, money }) {
  const [catalog, setCatalog] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!branchId) return
    let active = true
    setError(null)
    posApi.state({ branchId }).then((response) => {
      if (!active) return
      const mapped = mapPosStateFromApi(response, { branchId })
      setCatalog(
        (mapped.posCatalog || []).filter((item) => item.type === 'product' && !item.soldOut)
      )
    }).catch((failure) => {
      if (active) setError(failure)
    })
    return () => { active = false }
  }, [branchId])
  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es')
    if (!needle) return catalog.slice(0, 12)
    return catalog.filter((item) => (
      item.name.toLocaleLowerCase('es').includes(needle)
      || (item.sku || '').toLocaleLowerCase('es').includes(needle)
    )).slice(0, 12)
  }, [catalog, query])
  const add = (product) => {
    if (extras.some((row) => row.itemId === product.id)) return
    onChange([...extras, { itemId: product.id, name: product.name, price: product.price, quantity: 1 }])
    setQuery('')
  }
  const updateQty = (itemId, quantity) => {
    onChange(extras.map((row) => (
      row.itemId === itemId ? { ...row, quantity: Math.max(1, Number(quantity) || 1) } : row
    )))
  }
  const remove = (itemId) => onChange(extras.filter((row) => row.itemId !== itemId))
  return (
    <div className="space-y-3" data-testid="carwash-extra-products">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Añadir productos de caja</h3>
        <p className="text-xs text-slate-500">Se facturan en la misma venta que el lavado.</p>
      </div>
      <Input
        aria-label="Buscar producto"
        placeholder="Buscar por nombre o SKU…"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && <p role="alert" className="text-xs text-red-700">{error.message}</p>}
      {query && options.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {options.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                disabled={disabled || extras.some((row) => row.itemId === product.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                onClick={() => add(product)}
              >
                <span className="truncate font-medium">{product.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatDOP(product.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {extras.length > 0 && (
        <ul className="space-y-2" aria-label="Productos adicionales">
          {extras.map((row) => (
            <li key={row.itemId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="min-w-0">
                <strong className="break-words">{row.name}</strong>
                <p className="text-xs text-slate-500">{money(row.price)} c/u</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Cant.
                <Input
                  type="number"
                  min="1"
                  step="1"
                  className="w-20"
                  aria-label={`Cantidad de ${row.name}`}
                  value={row.quantity}
                  disabled={disabled}
                  onChange={(event) => updateQty(row.itemId, event.target.value)}
                />
              </label>
              <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => remove(row.itemId)}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
