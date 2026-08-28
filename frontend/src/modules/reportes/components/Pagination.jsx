import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PAGE_SIZE_OPTIONS } from '../lib/pagination'

export function Pagination({
  page,
  totalPages,
  total,
  from,
  to,
  pageSize,
  onPageChange,
  onPageSizeChange,
  noun = 'registros',
  testId = 'report-pagination',
}) {
  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between" data-testid={testId}>
      <p className="text-sm text-slate-500">
        {total === 0 ? `Sin ${noun}` : `Mostrando ${from} – ${to} de ${total} ${noun}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Por página</span>
            <Select
              value={String(pageSize)}
              onChange={(v) => onPageSizeChange(Number(v))}
              options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
              size="sm"
              className="w-20"
            />
          </div>
        )}
        <Button variant="secondary" size="sm" className="h-8 w-8 p-0" disabled={!canPrev} onClick={() => onPageChange(1)} aria-label="Primera página">
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" className="h-8 w-8 p-0" disabled={!canPrev} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-sm font-medium text-slate-700">
          Página {page} de {totalPages}
        </span>
        <Button variant="secondary" size="sm" className="h-8 w-8 p-0" disabled={!canNext} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" className="h-8 w-8 p-0" disabled={!canNext} onClick={() => onPageChange(totalPages)} aria-label="Última página">
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
