import { Clock, FileText, Trash2, User } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Tip } from '@/components/ui/Tip'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { calcSnapshotTotal } from '../lib/openAccount'

export function HeldCartsModal({ open, onClose, heldCarts, taxPct, onRestore, onRemove }) {
  return (
    <Modal open={open} onClose={onClose} title="Ventas retenidas" testId="held-carts-modal">
      <p className="-mt-2 mb-3 text-xs text-slate-500">
        Cotizaciones guardadas y ventas apartadas temporalmente.
      </p>
      {heldCarts.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No hay ventas ni cotizaciones retenidas</p>
      ) : (
        <div className="space-y-2">
          {heldCarts.map((held) => {
            const total = held.total != null
              ? Number(held.total) || 0
              : calcSnapshotTotal({ ...held, taxPct })
            const itemCount = held.items.reduce((n, i) => n + i.qty, 0)
            const isQuote = held.heldKind === 'quote'
            return (
              <div
                key={held.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"
                data-testid={`held-cart-${held.id}`}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    isQuote ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                  )}
                >
                  {isQuote ? <FileText className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {held.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    <span
                      className={cn(
                        'mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                        isQuote ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      )}
                    >
                      {isQuote ? 'Cotización' : 'Venta'}
                    </span>
                    {itemCount} ítem{itemCount !== 1 ? 's' : ''} · {formatDOP(total)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Tip title="Restaurar" body="Vuelve a cargar esta cuenta en el carrito." side="left">
                    <Button size="sm" onClick={() => onRestore(held.id)}>
                      Restaurar
                    </Button>
                  </Tip>
                  <Tip title="Eliminar" body="Quita esta retención de forma permanente." side="left">
                    <button
                      type="button"
                      onClick={() => onRemove(held.id)}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      data-testid={`held-cart-remove-${held.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tip>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
