import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { QUOTE_STATUS_META } from '@/data/crm'
import { formatDOP } from '@/lib/format'
import { useCrmStore } from '@/stores/crmStore'
import { useCrmCapabilities } from '@/modules/crm/hooks/useCrmCapabilities'
import { isQuoteEditable } from '@/modules/crm/lib/quoteForm'
import { isQuoteInvoiced } from '@/modules/crm/lib/quoteInvoice'
import { QuoteFormModal } from './QuoteFormModal'
import { SimplifiedLeadQuoteTimelineActions } from './SimplifiedLeadQuoteTimelineActions'

export function LeadQuoteManageModal({
  open,
  onClose,
  quote,
  documentCtx,
  onQuoteChanged,
}) {
  const can = useCrmCapabilities()
  const deleteQuote = useCrmStore((state) => state.deleteQuote)
  const ensureQuoteDetail = useCrmStore((state) => state.ensureQuoteDetail)
  const quotes = useCrmStore((state) => state.quotes)

  const [detail, setDetail] = useState(quote)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const quoteId = quote?.id

  useEffect(() => {
    if (!open || !quoteId) return
    const fromStore = quotes.find((item) => item.id === quoteId) || quote
    setDetail(fromStore)
    ensureQuoteDetail(quoteId)
      .then((loaded) => {
        if (loaded) setDetail(loaded)
      })
      .catch(() => {})
  }, [open, quoteId, quote, quotes, ensureQuoteDetail])

  useEffect(() => {
    if (!open) {
      setEditOpen(false)
      setConfirmDelete(false)
    }
  }, [open])

  if (!quoteId) return null

  const statusMeta = QUOTE_STATUS_META[detail?.status] || { label: detail?.status, tone: 'neutral' }
  const editable = can.quote && isQuoteEditable(detail)
  const invoiced = isQuoteInvoiced(detail)
  const canDiscard = can.quote && !invoiced

  const handleDelete = async () => {
    setBusy(true)
    try {
      await deleteQuote(detail.id)
      toast.success('Cotización descartada')
      onQuoteChanged?.()
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo descartar la cotización')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const handleEditSaved = (saved) => {
    setEditOpen(false)
    if (saved?.id) setDetail(saved)
    onQuoteChanged?.()
  }

  return (
    <>
      <Modal
        open={open && !editOpen}
        onClose={onClose}
        title={detail?.number ? `Cotización ${detail.number}` : 'Cotización'}
        wide
        testId="lead-quote-manage-modal"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusMeta.tone || 'neutral'}>{statusMeta.label}</Badge>
            {invoiced ? <Badge tone="success">Facturada</Badge> : null}
          </div>

          <p className="font-heading text-2xl font-bold text-emerald-600">
            {formatDOP(detail?.total || 0)}
          </p>

          <div className="rounded-xl border border-slate-100 bg-slate-50/80">
            <ul className="divide-y divide-slate-100">
              {(detail?.items || []).length === 0 ? (
                <li className="px-4 py-3 text-sm text-slate-500">Sin ítems en la cotización.</li>
              ) : (
                (detail?.items || []).map((item, index) => {
                  const qty = item.qty ?? item.quantity ?? 1
                  const price = Number(item.price ?? item.unitPrice) || 0
                  return (
                    <li key={item.id || `${item.itemId}-${index}`} className="flex justify-between gap-3 px-4 py-3 text-sm">
                      <span className="font-medium text-slate-800">
                        {item.name || item.itemName || 'Ítem'} × {qty}
                      </span>
                      <span className="shrink-0 font-semibold text-slate-700">{formatDOP(price * qty)}</span>
                    </li>
                  )
                })
              )}
            </ul>
          </div>

          {documentCtx ? (
            <SimplifiedLeadQuoteTimelineActions quote={detail} documentCtx={documentCtx} />
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            {editable ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditOpen(true)}
                data-testid="lead-quote-manage-edit"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            ) : null}
            {canDiscard ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirmDelete(true)}
                data-testid="lead-quote-manage-delete"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => !busy && setConfirmDelete(false)}
        title="Eliminar cotización"
        testId="lead-quote-delete-confirm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            La cotización se marcará como descartada. Esta acción no se puede deshacer desde aquí.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={busy}>
              {busy ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        </div>
      </Modal>

      <QuoteFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        quote={detail}
        onSaved={handleEditSaved}
      />
    </>
  )
}
