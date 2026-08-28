import { createContext, useContext } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const SortableTableContext = createContext(null)

export function SortableTableProvider({ sortKey, sortDir, onSort, children }) {
  return (
    <SortableTableContext.Provider value={{ sortKey, sortDir, onSort }}>
      {children}
    </SortableTableContext.Provider>
  )
}

export function SortableTh({
  column,
  children,
  className,
  align = 'left',
  sortable = true,
}) {
  const ctx = useContext(SortableTableContext)
  const active = ctx?.sortKey === column
  const alignClass =
    align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left justify-start'

  if (!sortable || !ctx?.onSort) {
    return (
      <th className={cn(alignClass.includes('text-right') ? 'text-right' : alignClass.includes('text-center') ? 'text-center' : 'text-left', className)}>
        {children}
      </th>
    )
  }

  const Icon = active ? (ctx.sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <th className={cn(className)}>
      <button
        type="button"
        onClick={() => ctx.onSort(column)}
        className={cn(
          'group inline-flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors',
          alignClass,
          active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
        )}
        data-testid={column ? `sort-${column}` : undefined}
      >
        <span>{children}</span>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'opacity-100' : 'opacity-40 group-hover:opacity-70')} />
      </button>
    </th>
  )
}
