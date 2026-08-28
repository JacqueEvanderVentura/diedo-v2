import { useMemo } from 'react'
import { toast } from 'sonner'
import { SearchX } from 'lucide-react'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { usePosStore } from '@/stores/posStore'
import { ProductCard } from './ProductCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'

export function ProductGrid({ query, category, loading }) {
  const addItem = usePosStore((s) => s.addItem)
  const products = useCatalogStore((s) => s.products)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (!isPosSellable(p)) return false
      const matchCat = category === 'all' || p.category === category
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku && String(p.sku).toLowerCase().includes(q))
      return matchCat && matchQuery
    })
  }, [products, query, category])

  const handleAdd = (product) => {
    if (product.type === 'product' && product.stock !== null && !product.allowNegativeStock) {
      const inCart = usePosStore.getState().items.find((i) => i.id === product.id)?.qty || 0
      if (inCart >= product.stock) {
        toast.error(`Solo quedan ${product.stock} en stock`)
        return
      }
    }
    addItem(product)
    toast.success(`${product.name} agregado al carrito`)
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[240px]" />
        ))}
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Sin resultados"
        description="No encontramos productos con esos filtros. Prueba otra búsqueda o categoría."
      />
    )
  }

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      data-testid="pos-product-grid"
    >
      {filtered.map((product, i) => (
        <ProductCard key={product.id} product={product} index={i} onAdd={handleAdd} />
      ))}
    </div>
  )
}
