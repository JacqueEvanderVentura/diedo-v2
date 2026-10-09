import { Modal } from '@/components/ui/Modal'
import { ProofImagePreview } from '@/modules/pos/components/ProofImagePreview'
import { loadPurchaseQuoteBlob } from '@/modules/compras/lib/purchaseRequestExtras'

export function PurchaseDocumentModal({ open, onClose, request, file, title }) {
  const hasPreview = Boolean(
    file?.dataUrl || file?.previewObjectUrl || file?.previewUrl || file?.downloadUrl
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={request ? `${title} · ${request.number || request.id}` : title}
      testId="purchase-document-modal"
      wide
    >
      {!file ? (
        <p className="text-sm text-slate-500">No hay archivo adjunto de este tipo.</p>
      ) : !hasPreview ? (
        <p className="text-sm text-slate-600">
          Archivo registrado: <span className="font-semibold">{file.name}</span>
          <span className="mt-2 block text-xs text-slate-400">
            Sube de nuevo el archivo para habilitar vista previa.
          </span>
        </p>
      ) : (
        <ProofImagePreview
          proof={{
            name: file.name,
            contentType: file.contentType,
            downloadUrl: file.dataUrl || file.previewObjectUrl || file.previewUrl || file.downloadUrl,
            previewUrl: file.previewUrl || file.downloadUrl,
          }}
          loadProof={() => loadPurchaseQuoteBlob(file)}
          onDownload={async () => {
            const blob = await loadPurchaseQuoteBlob(file)
            const url = URL.createObjectURL(blob)
            const anchor = window.document.createElement('a')
            anchor.href = url
            anchor.download = file.name || 'documento'
            anchor.click()
            URL.revokeObjectURL(url)
          }}
        />
      )}
    </Modal>
  )
}
