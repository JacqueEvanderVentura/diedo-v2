import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { AttachmentField } from '@/components/ui/AttachmentField'
import { useCatalogStore } from '@/stores/catalogStore'

export function PurchaseReceiveModal({ open, onClose, request, onConfirm, busy }) {
  const catalogProducts = useCatalogStore((s) => s.products)
  const supplies = useMemo(
    () => catalogProducts.filter((product) => product.type === 'supply'),
    [catalogProducts]
  )

  const [receiptAttachments, setReceiptAttachments] = useState([])
  const [lineMap, setLineMap] = useState({})

  useEffect(() => {
    if (!open || !request) return
    const initial = {}
    for (const item of request.items || []) {
      initial[item.id] = item.inventoryItemId || ''
    }
    setLineMap(initial)
    setReceiptAttachments([])
  }, [open, request])

  const supplyOptions = supplies.map((row) => ({
    value: row.id,
    label: row.name,
  }))

  const handleConfirm = () => {
    const lines = (request.items || []).map((item) => ({
      itemId: item.id,
      inventoryItemId: lineMap[item.id],
    }))
    onConfirm?.({ lines, receiptAttachments })
  }

  const canSubmit = (request?.items || []).every((item) => lineMap[item.id])
    && receiptAttachments.some((file) => file.pendingFile || file.dataUrl)

  return (
    <Modal open={open} onClose={onClose} title="Marcar como recibida">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Sube una foto del comprobante y asocia cada línea a un insumo de inventario.
        </p>
        <AttachmentField
          value={receiptAttachments}
          onChange={setReceiptAttachments}
          testId="purchase-receipt-upload"
        />
        <p className="text-xs text-amber-700">
          La recepción requiere al menos una foto (no PDF).
        </p>
        <ul className="space-y-3">
          {(request?.items || []).map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-100 p-3">
              <p className="text-sm font-medium text-slate-800">
                {item.name} × {item.qty} {item.unit}
              </p>
              <Select
                className="mt-2"
                value={lineMap[item.id] || ''}
                onChange={(value) => setLineMap((prev) => ({ ...prev, [item.id]: value }))}
                options={supplyOptions}
                placeholder="Insumo de inventario"
                searchable
              />
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || busy}>
            {busy ? 'Guardando…' : 'Confirmar recepción'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
