import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'

export function CategoryBubbles({ active, onChange, onNewItem }) {
  const categories = useConfigStore((s) => s.categories)
  const items = useMemo(() => [{ id: 'all', name: 'Todos' }, ...categories], [categories])
  return (
    <div className="mb-4 flex items-center gap-3" data-testid="pos-category-bubbles">
      <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((cat) => {
          const isActive = active === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => onChange(cat.id)}
              data-testid={`pos-category-${cat.id}`}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full border px-5 py-2.5 text-sm font-medium transition-[background-color,color,border-color,box-shadow] duration-200',
                isActive
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'
              )}
            >
              {cat.name}
            </button>
          )
        })}
      </div>

      {onNewItem && (
        <button
          type="button"
          onClick={onNewItem}
          data-testid="pos-new-item"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo Ítem
        </button>
      )}
    </div>
  )
}
