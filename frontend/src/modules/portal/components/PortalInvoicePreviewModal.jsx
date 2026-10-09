import { Download, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export function PortalInvoicePreviewModal({
  open,
  onClose,
  saleNumber,
  pdfUrl,
  loading,
  error,
}) {
  const title = saleNumber ? `Factura ${saleNumber}` : 'Factura'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      testId="portal-invoice-preview-modal"
      wide
      bodyClassName="space-y-4"
    >
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500" role="status">Cargando factura…</p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>
      ) : null}
      {pdfUrl && !loading ? (
        <iframe
          title={title}
          src={pdfUrl}
          className="h-[min(70vh,32rem)] w-full rounded-xl border border-slate-200 bg-white"
          data-testid="portal-invoice-preview-frame"
        />
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {pdfUrl ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
              data-testid="portal-invoice-open-tab"
            >
              <ExternalLink className="h-4 w-4" /> Abrir en pestaña
            </Button>
            <a
              href={pdfUrl}
              download={`${saleNumber || 'factura'}.pdf`}
              className="inline-flex"
            >
              <Button variant="secondary" size="sm" type="button" data-testid="portal-invoice-download">
                <Download className="h-4 w-4" /> Descargar
              </Button>
            </a>
          </>
        ) : null}
        <Button size="sm" onClick={onClose} data-testid="portal-invoice-preview-close">
          Cerrar
        </Button>
      </div>
    </Modal>
  )
}
