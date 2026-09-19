import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function BulkSelectionBar({
  selectedCount,
  totalSelectable,
  onSelectAll,
  onDelete,
  deleting = false,
  deleteLabel = 'Eliminar seleccionados',
  testId = 'bulk-selection-bar',
}) {
  const allSelected = totalSelectable > 0 && selectedCount >= totalSelectable

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-slate-600">{selectedCount} seleccionados</span>
        {totalSelectable > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onSelectAll}
            data-testid={`${testId}-select-all`}
          >
            {allSelected ? 'Quitar todos' : 'Seleccionar todos'}
          </Button>
        )}
      </div>
      <Button
        size="sm"
        variant="danger"
        disabled={!selectedCount || deleting}
        onClick={onDelete}
        data-testid={`${testId}-delete`}
      >
        <Trash2 className="h-3.5 w-3.5" /> {deleteLabel}
      </Button>
    </div>
  )
}
