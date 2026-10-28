import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useCrmStore } from '@/stores/crmStore'
import { DOC_TYPES, formatDocumentInput } from '@/modules/agenda/lib/selfBooking'
import { validateCustomerDocument } from '@/lib/customerDocuments'
import { preparePipelineCloseCustomer } from '@/modules/crm/lib/quoteCustomer'

export function LeadConvertModal({
  open,
  onClose,
  lead,
  onConverted,
  forPipelineClose = false,
}) {
  const convertToCustomer = useCrmStore((state) => state.convertToCustomer)
  const updateLead = useCrmStore((state) => state.updateLead)
  const updateQuote = useCrmStore((state) => state.updateQuote)
  const quotes = useCrmStore((state) => state.quotes)
  const [form, setForm] = useState({ docType: 'cedula', documentId: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      docType: lead?.docType || lead?.documentType || 'cedula',
      documentId: lead?.documentId
        ? formatDocumentInput(lead.documentId, lead.docType || lead.documentType || 'cedula')
        : '',
    })
    setSubmitting(false)
  }, [lead, open])

  const submit = async () => {
    if (!lead?.id) return
    const docErr = validateCustomerDocument(form.docType, form.documentId)
    if (docErr) return toast.error(docErr)
    setSubmitting(true)
    try {
      const documentOverride = {
        docType: form.docType,
        documentId: form.documentId.trim(),
      }
      const customer = forPipelineClose
        ? await preparePipelineCloseCustomer({
          lead,
          convertToCustomer,
          updateLead,
          updateQuote,
          quotes,
          documentOverride,
        })
        : await convertToCustomer(lead.id, documentOverride)
      onConverted?.(customer, lead)
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo crear el cliente')
    } finally {
      setSubmitting(false)
    }
  }

  const displayName = (lead?.company || lead?.name || '').trim() || 'Lead'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={forPipelineClose ? 'Cliente para facturar' : 'Convertir lead a cliente'}
      testId="lead-convert-modal"
    >
      <p className="mb-4 text-sm text-slate-600">
        {forPipelineClose
          ? `Crea la ficha de ${displayName} para facturar sin cerrar el lead todavía.`
          : `Para crear el cliente de ${displayName}, ingresa el documento de identidad. El lead se queda en su etapa actual.`}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo de documento</label>
          <Select
            value={form.docType}
            onChange={(value) => setForm((current) => ({ ...current, docType: value }))}
            options={DOC_TYPES.map((item) => ({ value: item.id, label: item.label }))}
            data-testid="lead-convert-doc-type"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Documento</label>
          <Input
            value={form.documentId}
            onChange={(event) => setForm((current) => ({
              ...current,
              documentId: formatDocumentInput(event.target.value, current.docType),
            }))}
            placeholder={form.docType === 'cedula' ? '001-1234567-8' : form.docType === 'rnc' ? '123456789' : 'Pasaporte'}
            data-testid="lead-convert-document"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button onClick={submit} disabled={submitting} data-testid="lead-convert-submit">
          <UserPlus className="h-4 w-4" />
          {submitting ? 'Creando…' : 'Crear cliente'}
        </Button>
      </div>
    </Modal>
  )
}
