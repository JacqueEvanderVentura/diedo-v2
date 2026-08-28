import { CalendarDays, Package, Plus } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

export function ProductCard({ product, index, onAdd }) {
  const isService = product.type === 'service'
  const soldOut = product.type === 'product' && product.stock === 0 && !product.allowNegativeStock
  const Icon = isService ? CalendarDays : Package

  return (
    <button
      type="button"
      onClick={() => !soldOut && onAdd(product)}
      disabled={soldOut}
      data-testid={`pos-product-${product.id}`}
      style={{ animationDelay: `${Math.min(index * 0.03, 0.4)}s` }}
      className={cn(
        'group relative flex h-full animate-fade-up flex-col rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-soft transition-[box-shadow,border-color,transform] duration-300',
        soldOut
          ? 'cursor-not-allowed opacity-60'
          : 'hover:-translate-y-1 hover:border-blue-100 hover:shadow-md'
      )}
    >
      <div className="absolute right-3 top-3 z-10">
        {isService ? (
          <Badge tone="brand">Servicio</Badge>
        ) : soldOut ? (
          <Badge tone="danger">Agotado</Badge>
        ) : (
          <Badge tone="success">{product.stock} en stock</Badge>
        )}
      </div>

      <div className="relative mb-3 flex aspect-[4/3] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 text-slate-300">
        {product.image ? (
          <img src={product.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-10 w-10" strokeWidth={1.25} />
        )}
        {!soldOut && (
          <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </span>
        )}
      </div>

      <p className="mb-1 text-xs font-medium text-slate-400">
        {product.sku ? product.sku : 'S/SKU'}
      </p>
      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-slate-800 transition-colors group-hover:text-blue-600">
        {product.name}
      </p>
      <p className="mt-1.5 whitespace-nowrap font-heading text-base font-bold tabular-nums tracking-tight text-blue-600">
        {formatDOP(product.price)}
      </p>
    </button>
  )
}
