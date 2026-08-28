import { useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { PosTopBar } from '../components/PosTopBar'
import { CategoryBubbles } from '../components/CategoryBubbles'
import { ProductGrid } from '../components/ProductGrid'
import { CartSidebar } from '../components/CartSidebar'
import { CartDrawer } from '../components/CartDrawer'
import { FlashItemModal } from '../components/FlashItemModal'

export default function PosPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [flashOpen, setFlashOpen] = useState(false)
  const loading = false

  const itemCount = usePosStore((s) => s.items.reduce((sum, i) => sum + i.qty, 0))
  const openCartDrawer = usePosStore((s) => s.openCartDrawer)

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <PosTopBar query={query} onQueryChange={setQuery} />
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          <CategoryBubbles active={category} onChange={setCategory} onNewItem={() => setFlashOpen(true)} />
          <ProductGrid query={query} category={category} loading={loading} />
        </div>
      </div>

      <CartSidebar />

      <CartDrawer />
      {flashOpen && <FlashItemModal onClose={() => setFlashOpen(false)} />}
      <button
        onClick={openCartDrawer}
        data-testid="pos-cart-fab"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-300 transition-transform active:scale-95 lg:hidden"
      >
        <ShoppingCart className="h-6 w-6" />
        {itemCount > 0 && (
          <span
            data-testid="pos-cart-fab-count"
            className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white ring-2 ring-white"
          >
            {itemCount}
          </span>
        )}
      </button>
    </div>
  )
}
