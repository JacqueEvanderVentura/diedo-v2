import { PurchaseDocumentModal } from '@/modules/compras/components/PurchaseDocumentModal'

export function PurchaseQuoteModal({ open, onClose, request }) {
  return (
    <PurchaseDocumentModal
      open={open}
      onClose={onClose}
      request={request}
      file={request?.quoteFile}
      title="Cotización"
    />
  )
}
