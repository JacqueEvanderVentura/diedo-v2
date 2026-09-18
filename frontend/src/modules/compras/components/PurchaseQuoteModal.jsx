import { Modal } from '@/components/ui/Modal'
import { ProofImagePreview } from '@/modules/pos/components/ProofImagePreview'
import { loadPurchaseQuoteBlob } from '@/modules/compras/lib/purchaseRequestExtras'

export function PurchaseQuoteModal({ open, onClose, request }) {
  const quote = request?.quoteFile
  const hasPreview = Boolean(quote?.dataUrl || quote?.previewObjectUrl)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={request ? `Cotización · ${request.number || request.id}` : 'Cotización'}
      testId="purchase-quote-modal"
      wide
    >
      {!quote ? (
        <p className="text-sm text-slate-500">No hay cotización adjunta a esta solicitud.</p>
      ) : !hasPreview ? (
        <p className="text-sm text-slate-600">
          Archivo registrado: <span className="font-semibold">{quote.name}</span>
          <span className="mt-2 block text-xs text-slate-400">Sube de nuevo la cotización para habilitar vista previa.</span>
        </p>
      ) : (
        <ProofImagePreview
          proof={{
            name: quote.name,
            contentType: quote.contentType,
            downloadUrl: quote.dataUrl || quote.previewObjectUrl,
          }}
          loadProof={() => loadPurchaseQuoteBlob(quote)}
          onDownload={async () => {
            const blob = await loadPurchaseQuoteBlob(quote)
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = quote.name || 'cotizacion'
            anchor.click()
            URL.revokeObjectURL(url)
          }}
        />
      )}
    </Modal>
  )
}
