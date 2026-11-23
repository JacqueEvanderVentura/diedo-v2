import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatLocaleDateTime12h } from '@/lib/format'
import { cn } from '@/lib/utils'

function fmtWhen(iso) {
  try {
    return formatLocaleDateTime12h(iso, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function NotificationList({
  items,
  onOpen,
  emptyMessage = 'No tienes notificaciones.',
  page,
  pageSize,
  total,
  onPageChange,
  compact = false,
}) {
  const totalPages = total ? Math.ceil(total / pageSize) : 0
  const canPaginate = totalPages > 1

  return (
    <>
      <div className={cn('overflow-y-auto p-2', compact ? 'max-h-80' : 'min-h-[280px]')}>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-400">{emptyMessage}</p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onOpen(n)}
              data-testid={`notification-${n.id}`}
              className={cn(
                'flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
                !n.read && 'bg-blue-50/60'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
              </div>
              <p className="text-xs leading-relaxed text-slate-500">{n.body}</p>
              <p className="text-[10px] text-slate-400">{fmtWhen(n.createdAt)}</p>
            </button>
          ))
        )}
      </div>

      {canPaginate && (
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  )
}