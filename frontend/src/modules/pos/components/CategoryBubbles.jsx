import { cn } from '@/lib/utils'
import { CATEGORIES } from '@/data/products'

export function CategoryBubbles({ active, onChange }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide" data-testid="pos-category-bubbles">
      {CATEGORIES.map((cat) => {
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
  )
}
