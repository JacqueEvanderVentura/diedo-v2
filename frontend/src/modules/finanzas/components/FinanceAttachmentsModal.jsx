import { Modal } from '@/components/ui/Modal'
import { ProofImagePreview } from '@/modules/pos/components/ProofImagePreview'
import { loadFinanceAttachmentBlob } from '@/modules/finanzas/lib/financeAttachments'

export function FinanceAttachmentsModal({ open, onClose, title, attachments = [] }) {
  const items = (attachments || []).filter((item) => item?.dataUrl || item?.previewObjectUrl)

  return (
    <Modal open={open} onClose={onClose} title={title || 'Comprobantes'} testId="finance-attachments-modal" wide>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No hay comprobantes adjuntos para este movimiento.</p>
      ) : (
        <div className="space-y-6">
          {items.map((attachment, index) => (
            <ProofImagePreview
              key={attachment.id || `${index}-${attachment.name}`}
              proof={{
                name: attachment.name,
                contentType: attachment.contentType,
                downloadUrl: attachment.dataUrl || attachment.previewObjectUrl,
              }}
              loadProof={() => loadFinanceAttachmentBlob(attachment)}
              onDownload={async () => {
                const blob = await loadFinanceAttachmentBlob(attachment)
                const url = URL.createObjectURL(blob)
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = attachment.name || 'comprobante'
                anchor.click()
                URL.revokeObjectURL(url)
              }}
            />
          ))}
        </div>
      )}
    </Modal>
  )
}
