import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Minus, Plus, Trash2, Tag } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { usePosStore } from '@/stores/posStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { cn } from '@/lib/utils'

export function CartItem({ item }) {
  const incItem = usePosStore((s) => s.incItem)
  const decItem = usePosStore((s) => s.decItem)
  const removeItem = usePosStore((s) => s.removeItem)
  const setItemPrice = usePosStore((s) => s.setItemPrice)
  const isFinalized = usePosStore((s) => s.isFinalized)
  const products = useCatalogStore((s) => s.products)

  const listPrice = Number(item.listPrice ?? item.price) || 0
  const unitPrice = Number(item.price) || 0
  const discounted = unitPrice < listPrice - 0.001

  const handleInc = () => {
    const cat = products.find((p) => p.id === item.id)
    if (cat && cat.type === 'product' && cat.stock !== null && item.qty >= cat.stock) {
      toast.error(`Solo quedan ${cat.stock} en stock`)
      return
    }
    incItem(item.id)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      data-testid={`cart-item-${item.id}`}
      className="flex w-full min-w-0 gap-3 overflow-hidden rounded-xl border border-slate-100 p-3"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
        <Tag className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">{item.name}</p>
          <button
            onClick={() => removeItem(item.id)}
            disabled={isFinalized}
            data-testid={`cart-item-remove-${item.id}`}
            className="shrink-0 text-slate-300 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
          {discounted && (
            <span className="text-slate-400 line-through">{formatDOP(listPrice)}</span>
          )}
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice || ''}
              onChange={(e) => setItemPrice(item.id, e.target.value)}
              disabled={isFinalized}
              data-testid={`cart-item-price-${item.id}`}
              className={cn(
                'w-[5.5rem] rounded-md border border-slate-200 bg-white py-1 pl-5 pr-1.5 text-right text-xs font-semibold text-slate-700',
                'focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400',
                isFinalized && 'cursor-not-allowed bg-slate-50 text-slate-500'
              )}
            />
          </div>
          <span className="text-slate-400">c/u</span>
        </div>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-1">
            <button
              onClick={() => decItem(item.id)}
              disabled={isFinalized}
              data-testid={`cart-item-dec-${item.id}`}
              className="flex h-6 w-6 items-center justify-center rounded bg-white text-slate-600 shadow-sm transition-colors hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span
              className="min-w-[20px] text-center text-sm font-semibold text-slate-800"
              data-testid={`cart-item-qty-${item.id}`}
            >
              {item.qty}
            </span>
            <button
              onClick={handleInc}
              disabled={isFinalized}
              data-testid={`cart-item-inc-${item.id}`}
              className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="shrink-0 font-heading text-sm font-bold tabular-nums text-slate-900">
            {formatDOP(unitPrice * item.qty)}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
