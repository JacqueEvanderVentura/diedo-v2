import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardCheck, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useInventarioStore } from '@/stores/inventarioStore'

export function AjusteStockModal({ open, onClose, branchId = 'all' }) {
  const branches = useConfigStore((state) => state.branches)
  const isOnline = useSessionStore((state) => state.isOnline())
  const loadStockItems = useInventarioStore((state) => state.loadStockItems)
  const recordAdjustment = useInventarioStore((state) => state.recordAdjustment)
  const initialBranchId = branchId === 'all' ? branches[0]?.id || '' : branchId

  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId)
  const [stockItems, setStockItems] = useState([])
  const [selected, setSelected] = useState([])
  const [query, setQuery] = useState('')
  const [comment, setComment] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  const branchOptions = useMemo(
    () => branches.filter((branch) => branch.active !== false).map((branch) => ({ value: branch.id, label: branch.name })),
    [branches]
  )

  useEffect(() => {
    if (!open) return
    setSelectedBranchId(branchId === 'all' ? branches[0]?.id || '' : branchId)
  }, [open, branchId, branches])

  useEffect(() => {
    if (!open || !selectedBranchId) return
    let active = true
    setLoadingItems(true)
    setLoadError('')
    loadStockItems(selectedBranchId, { isOnline })
      .then((items) => {
        if (active) setStockItems(items)
      })
      .catch((error) => {
        if (active) {
          setStockItems([])
          setLoadError(error.message || 'No se pudo cargar el inventario de la sucursal.')
        }
      })
      .finally(() => {
        if (active) setLoadingItems(false)
      })
    return () => {
      active = false
    }
  }, [open, selectedBranchId, isOnline, loadStockItems])

  const available = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const picked = new Set(selected.map((item) => item.id))
    return stockItems.filter((item) => {
      if (picked.has(item.id)) return false
      if (!normalizedQuery) return true
      return item.name.toLowerCase().includes(normalizedQuery) || item.sku?.toLowerCase().includes(normalizedQuery)
    })
  }, [stockItems, selected, query])

  const addItem = (item) => setSelected((list) => [...list, { ...item, quantity: item.stock }])
  const removeItem = (id) => setSelected((list) => list.filter((item) => item.id !== id))
  const setQuantity = (id, quantity) => setSelected((list) => list.map((item) => (
    item.id === id ? { ...item, quantity } : item
  )))

  const reset = () => {
    setSelected([])
    setQuery('')
    setComment('')
    setLoadError('')
  }

  const handleBranchChange = (nextBranchId) => {
    setSelectedBranchId(nextBranchId)
    reset()
  }

  const handleClose = () => {
    if (saving) return
    reset()
    onClose()
  }

  const submit = async () => {
    if (!selected.length) return toast.error('Selecciona al menos un producto o insumo.')
    if (selected.some((item) => item.quantity === '' || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0)) {
      return toast.error('La existencia física debe ser cero o un número positivo.')
    }
    if (selected.every((item) => Number(item.quantity) === Number(item.stock))) {
      return toast.error('Indica al menos una existencia física distinta al stock actual.')
    }
    if (comment.trim().length < 2) return toast.error('Indica el motivo del ajuste.')

    setSaving(true)
    try {
      await recordAdjustment({
        branchId: selectedBranchId,
        comment,
        items: selected.map((item) => ({ ...item, quantity: Number(item.quantity) })),
      }, { isOnline })
      toast.success(`Ajuste registrado (${selected.length} ítem${selected.length > 1 ? 's' : ''})`)
      reset()
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo registrar el ajuste.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      open
      onClose={handleClose}
      xlarge
      bodyClassName="!p-0"
      testId="ajuste-stock-modal"
      title={
        <div>
          <h2 className="font-heading text-lg font-semibold text-slate-900">Ajuste de inventario</h2>
          <p className="mt-1 text-sm font-normal text-slate-500">Registra la existencia física encontrada; el sistema calculará la diferencia.</p>
        </div>
      }
    >
      <div className="border-t border-slate-100 p-5 pb-0">
        <label className="mb-1.5 block text-xs font-medium text-slate-600">Sucursal *</label>
        <Select
          value={selectedBranchId}
          onChange={handleBranchChange}
          options={branchOptions}
          disabled={branchId !== 'all' || saving}
          size="sm"
          data-testid="ajuste-branch"
        />
      </div>

      <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-2">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-6 md:border-b-0 md:border-r">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto o insumo..."
              data-testid="ajuste-search"
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {loadingItems && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando inventario…
              </div>
            )}
            {!loadingItems && loadError && <p className="py-8 text-center text-sm text-red-600" role="alert">{loadError}</p>}
            {!loadingItems && !loadError && available.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item)}
                data-testid={`ajuste-add-${item.id}`}
                className="group flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{item.name}</p>
                  <p className="text-[10px] text-slate-400">Sistema: {item.stock} {item.unit || 'ud'} · {item.type === 'supply' ? 'Insumo' : 'Producto'}</p>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-blue-600 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
            {!loadingItems && !loadError && available.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">No hay ítems disponibles.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col p-6">
          <p className="mb-3 text-sm font-semibold text-slate-700">Conteo físico</p>
          <div className="min-h-[190px] flex-1 space-y-2 overflow-y-auto scrollbar-thin">
            {selected.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                <ClipboardCheck className="mb-2 h-10 w-10 text-slate-300" />
                <p className="text-xs text-slate-400">Selecciona ítems a la izquierda</p>
              </div>
            ) : selected.map((item) => {
              const delta = Number(item.quantity) - Number(item.stock)
              return (
                <div key={item.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                      <p className="text-[10px] text-slate-400">Stock actual: {item.stock} {item.unit || 'ud'}</p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity}
                      aria-label={`Existencia física de ${item.name}`}
                      onChange={(event) => setQuantity(item.id, event.target.value)}
                      className="w-24 rounded-lg border-0 bg-slate-50 px-2 py-1.5 text-center text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      aria-label={`Quitar ${item.name}`}
                      onClick={() => removeItem(item.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {item.quantity !== '' && Number.isFinite(delta) && delta !== 0 && (
                    <p className={`mt-2 text-right text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      Diferencia: {delta > 0 ? '+' : ''}{delta} {item.unit || 'ud'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Motivo del ajuste *</label>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Ej.: Conteo físico de cierre, merma o corrección..."
                rows={3}
                data-testid="ajuste-comment"
                className="w-full resize-none rounded-xl border-0 bg-white p-3 text-xs ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
            </div>
            <Button onClick={submit} disabled={saving || loadingItems} className="w-full" data-testid="ajuste-confirm">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Registrando…' : 'Confirmar ajuste'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
