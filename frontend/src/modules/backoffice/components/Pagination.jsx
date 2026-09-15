import { Button } from '@/components/ui/Button'
import { BackofficeSelect } from './BackofficeSelect'

export function Pagination({
  page,
  pageSize = 25,
  totalItems = 0,
  totalPages = 0,
  onPage,
  onPageSize,
  disabled = false,
}) {
  return (
    <nav
      aria-label="Paginación"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"
    >
      <span>
        {totalItems} resultados · Página {page} de {Math.max(totalPages, 1)}
      </span>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <BackofficeSelect
            aria-label="Resultados por página"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            disabled={disabled}
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} por página
              </option>
            ))}
          </BackofficeSelect>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  )
}
