import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Minus, Plus, Trash2, Tag } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { usePosStore } from '@/stores/posStore'
import { useCatalogStore } from '@/stores/catalogStore'

export function CartItem({ item }) {
  const incItem = usePosStore((s) => s.incItem)
  const decItem = usePosStore((s) => s.decItem)
  const removeItem = usePosStore((s) => s.removeItem)
  const products = useCatalogStore((s) => s.products)

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
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      data-testid={`cart-item-${item.id}`}
      className="flex gap-3 rounded-xl border border-slate-100 p-3"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
        <Tag className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">{item.name}</p>
          <button
            onClick={() => removeItem(item.id)}
            data-testid={`cart-item-remove-${item.id}`}
            className="shrink-0 text-slate-300 transition-colors hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{formatDOP(item.price)} c/u</p>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-1">
            <button
              onClick={() => decItem(item.id)}
              data-testid={`cart-item-dec-${item.id}`}
              className="flex h-6 w-6 items-center justify-center rounded bg-white text-slate-600 shadow-sm transition-colors hover:text-blue-600"
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
              data-testid={`cart-item-inc-${item.id}`}
              className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="font-heading text-sm font-bold text-slate-900">
            {formatDOP(item.price * item.qty)}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
