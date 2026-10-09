import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AttachmentField } from '@/components/ui/AttachmentField'
import { latestDocument } from '@/modules/compras/lib/purchaseDocuments'

export function PurchasePayModal({ open, onClose, request, onConfirm, busy }) {
  const [invoiceAttachments, setInvoiceAttachments] = useState([])
  const [paymentAttachments, setPaymentAttachments] = useState([])

  useEffect(() => {
    if (!open) return
    setInvoiceAttachments([])
    setPaymentAttachments([])
  }, [open])

  const hasInvoice = Boolean(latestDocument(request, 'invoice') || invoiceAttachments[0])
  const hasPayment = Boolean(latestDocument(request, 'payment') || paymentAttachments[0])

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago" testId="purchase-pay-modal">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Adjunta la factura del proveedor y el comprobante de pago para marcar la solicitud como pagada.
        </p>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Factura</p>
          {latestDocument(request, 'invoice') && (
            <p className="mb-2 text-sm text-slate-600">
              Ya hay una factura: <span className="font-semibold">{latestDocument(request, 'invoice').name}</span>
            </p>
          )}
          <AttachmentField
            value={invoiceAttachments}
            onChange={setInvoiceAttachments}
            testId="purchase-invoice-upload"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Comprobante de pago</p>
          {latestDocument(request, 'payment') && (
            <p className="mb-2 text-sm text-slate-600">
              Ya hay un comprobante: <span className="font-semibold">{latestDocument(request, 'payment').name}</span>
            </p>
          )}
          <AttachmentField
            value={paymentAttachments}
            onChange={setPaymentAttachments}
            testId="purchase-payment-upload"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm?.({ invoiceAttachments, paymentAttachments })}
            disabled={!hasInvoice || !hasPayment || busy}
          >
            {busy ? 'Registrando…' : 'Marcar pagada'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
