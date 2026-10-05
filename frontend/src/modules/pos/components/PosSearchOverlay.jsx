import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'
import { formatDOP } from '@/lib/format'
import { modalBackdropTransition, modalPanelTransition } from '@/lib/motion'
import { cn } from '@/lib/utils'

export function PosSearchOverlay({ open, query, onQueryChange, onClose }) {
  const inputRef = useRef(null)
  const addItem = usePosStore((s) => s.addItem)
  const catalogProducts = useCatalogStore((s) => s.products)
  const posCatalog = usePosStore((s) => s.posCatalog)
  const isOnline = useSessionStore((s) => s.status === 'online')
  const products = isOnline ? posCatalog : catalogProducts

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products.filter(isPosSellable).slice(0, 24)
    return products.filter((p) => {
      if (!isPosSellable(p)) return false
      return (
        p.name.toLowerCase().includes(q)
        || (p.sku && String(p.sku).toLowerCase().includes(q))
      )
    }).slice(0, 48)
  }, [products, query])

  const handlePick = (product) => {
    if (product.type === 'product' && product.stock !== null && !product.allowNegativeStock) {
      const inCart = usePosStore.getState().items.find((i) => i.id === product.id)?.qty || 0
      if (inCart >= product.stock) {
        toast.error(`Solo quedan ${product.stock} en stock`)
        return
      }
    }
    addItem(product)
    toast.success(`${product.name} agregado al carrito`)
    onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden p-4 pt-6 sm:p-6 sm:pt-10"
          data-testid="pos-search-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Buscar productos"
        >
          <motion.button
            type="button"
            aria-label="Cerrar búsqueda"
            initial={modalBackdropTransition.initial}
            animate={modalBackdropTransition.animate}
            exit={modalBackdropTransition.exit}
            transition={modalBackdropTransition.transition}
            className="absolute inset-0 cursor-default border-0 bg-slate-900/40 p-0 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={modalPanelTransition.initial}
            animate={modalPanelTransition.animate}
            exit={modalPanelTransition.exit}
            transition={modalPanelTransition.transition}
            className="relative z-10 flex max-h-[min(90dvh,calc(100vh-2rem))] w-full max-w-2xl min-h-0 flex-col"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Buscar productos, SKUs o códigos..."
                data-testid="pos-search-overlay-input"
                className="w-full rounded-2xl border-0 bg-white py-4 pl-12 pr-12 text-base text-slate-800 shadow-xl ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={onClose}
                data-testid="pos-search-overlay-close"
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar búsqueda"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 scrollbar-thin"
              data-testid="pos-search-overlay-results"
            >
              {results.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">Sin resultados</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {results.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => handlePick(product)}
                        data-testid={`pos-search-result-${product.id}`}
                        className={cn(
                          'flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-blue-50'
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{product.name}</p>
                          {product.sku && (
                            <p className="truncate text-xs text-slate-400">SKU {product.sku}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-blue-600">
                          {formatDOP(product.price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
