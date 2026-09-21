import { Modal } from '@/components/ui/Modal'
import { AttachmentProofSection } from '@/components/ui/AttachmentProofSection'
import { loadFinanceAttachmentBlob } from '@/modules/finanzas/lib/financeAttachments'

export function FinanceAttachmentsModal({
  open,
  onClose,
  title,
  attachments = [],
  loadProof,
  onDownload,
}) {
  const items = (attachments || []).map((item) => ({
    ...item,
    downloadUrl: item.downloadUrl || item.dataUrl || item.previewObjectUrl || null,
  }))

  return (
    <Modal open={open} onClose={onClose} title={title || 'Comprobantes'} testId="finance-attachments-modal" wide>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No hay comprobantes adjuntos para este movimiento.</p>
      ) : (
        <AttachmentProofSection
          items={items}
          loadProof={loadProof || ((attachment) => {
            if (attachment.dataUrl || attachment.previewObjectUrl) {
              return loadFinanceAttachmentBlob(attachment)
            }
            if (attachment.downloadUrl?.startsWith('data:')) {
              return fetch(attachment.downloadUrl).then((response) => response.blob())
            }
            if (attachment.downloadUrl) {
              return fetch(attachment.downloadUrl).then((response) => response.blob())
            }
            throw new Error('No se pudo cargar el comprobante.')
          })}
          onDownload={onDownload || (async (attachment) => {
            const blob = attachment.dataUrl || attachment.previewObjectUrl
              ? await loadFinanceAttachmentBlob(attachment)
              : await fetch(attachment.downloadUrl).then((response) => response.blob())
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = attachment.name || 'comprobante'
            anchor.click()
            URL.revokeObjectURL(url)
          })}
        />
      )}
    </Modal>
  )
}
