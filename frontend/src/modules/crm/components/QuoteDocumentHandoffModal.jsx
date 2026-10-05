import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatDOP } from '@/lib/format'
import { SimplifiedLeadQuoteTimelineActions } from './SimplifiedLeadQuoteTimelineActions'

export function QuoteDocumentHandoffModal({
  open,
  quote,
  documentCtx,
  onClose,
}) {
  if (!quote?.id) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cotización lista"
      testId="quote-document-handoff-modal"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Imprime o descarga el PDF antes de volver al pipeline.
        </p>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <p className="text-sm font-semibold text-slate-900">{quote.number || 'Cotización'}</p>
          <p className="mt-1 font-heading text-lg font-bold text-emerald-600">
            {formatDOP(quote.total || 0)}
          </p>
          <SimplifiedLeadQuoteTimelineActions quote={quote} documentCtx={documentCtx} />
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose} data-testid="quote-handoff-done">
            Volver al pipeline
          </Button>
        </div>
      </div>
    </Modal>
  )
}
