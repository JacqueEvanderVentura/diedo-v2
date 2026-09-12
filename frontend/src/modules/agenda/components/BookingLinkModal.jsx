import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, ExternalLink, MessageCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { WhatsAppPreviewPanel } from '@/components/ui/WhatsAppPreviewPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CustomerPicker } from '@/components/customers/CustomerPicker'
import { useSelfBookingStore } from '@/stores/selfBookingStore'
import { waMeUrl } from '@/lib/whatsapp'
import {
  buildBookingUrl,
  buildProfileUrl,
  buildBookingLinkWhatsAppMessage,
  DOC_TYPES,
  formatDocumentInput,
  normalizeDocumentId,
} from '../lib/selfBooking'

const emptyRecipient = () => ({
  docType: 'cedula',
  documentId: '',
  name: '',
  email: '',
  phone: '',
})

function mergeProfileIntoRecipient(current, found) {
  return {
    ...current,
    docType: found.docType || current.docType,
    documentId: formatDocumentInput(found.documentId, found.docType || current.docType),
    name: current.name.trim() ? current.name : found.name || current.name,
    email: current.email.trim() ? current.email : found.email || '',
    phone: current.phone.trim() ? current.phone : found.phone || '',
  }
}

export function BookingLinkModal({ open, onClose, branchId, branchName }) {
  const profiles = useSelfBookingStore((s) => s.profiles)
  const lookupByDocument = useSelfBookingStore((s) => s.lookupByDocument)
  const linkProfileToCustomer = useSelfBookingStore((s) => s.linkProfileToCustomer)
  const storeUpsertProfile = useSelfBookingStore((s) => s.upsertProfile)

  const [customer, setCustomer] = useState(null)
  const [recipient, setRecipient] = useState(emptyRecipient)

  const bookingUrl = buildBookingUrl(branchId)

  useEffect(() => {
    if (!open) return
    setCustomer(null)
    setRecipient(emptyRecipient())
  }, [open])

  const applyCustomer = (nextCustomer) => {
    setCustomer(nextCustomer)
    if (!nextCustomer) {
      setRecipient(emptyRecipient())
      return
    }
    const linkedProfile =
      (nextCustomer.documentId && lookupByDocument(nextCustomer.documentId))
      || profiles.find((p) => p.customerId === nextCustomer.id)
      || null
    const docType = linkedProfile?.docType || 'cedula'
    const rawDoc = linkedProfile?.documentId || nextCustomer.documentId || ''
    setRecipient({
      docType,
      documentId: rawDoc ? formatDocumentInput(rawDoc, docType) : '',
      name: nextCustomer.name || linkedProfile?.name || '',
      email: linkedProfile?.email || nextCustomer.email || '',
      phone: nextCustomer.phone || linkedProfile?.phone || '',
    })
  }

  const setRecipientField = (key, value) => {
    setRecipient((current) => {
      const next = { ...current, [key]: value }
      if (key === 'documentId') {
        next.documentId = formatDocumentInput(value, next.docType)
      }
      if (key === 'docType') {
        next.documentId = formatDocumentInput(next.documentId, value)
      }
      return next
    })
  }

  const documentKey = normalizeDocumentId(recipient.documentId)

  useEffect(() => {
    if (!documentKey) return
    const found = lookupByDocument(documentKey)
    if (!found) return
    setRecipient((current) => {
      const merged = mergeProfileIntoRecipient(current, found)
      if (
        merged.name === current.name
        && merged.email === current.email
        && merged.phone === current.phone
        && merged.documentId === current.documentId
      ) {
        return current
      }
      return merged
    })
  }, [documentKey, lookupByDocument])

  const tryAutofillFromDocument = () => {
    if (!documentKey) return
    const found = lookupByDocument(documentKey)
    if (!found) return
    setRecipient((current) => mergeProfileIntoRecipient(current, found))
    toast.message('Datos cargados del perfil de agendación')
  }

  const profileUrl = documentKey ? buildProfileUrl(documentKey) : null

  const whatsappMessage = useMemo(() => {
    const name = recipient.name.trim()
    if (!name) return null
    return buildBookingLinkWhatsAppMessage({
      profile: { name },
      branchName,
      bookingUrl,
      profileUrl,
    })
  }, [recipient.name, profileUrl, branchName, bookingUrl])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const persistRecipientProfile = () => {
    const name = recipient.name.trim()
    if (!name || !documentKey) return null
    const saved = storeUpsertProfile({
      docType: recipient.docType,
      documentId: documentKey,
      name,
      email: recipient.email.trim(),
      phone: recipient.phone.trim(),
      customerId: customer?.id || null,
    })
    if (customer?.id && saved?.id) linkProfileToCustomer(saved.id, customer.id)
    return saved
  }

  const sendWhatsApp = () => {
    if (!recipient.name.trim()) return toast.error('Ingresa el nombre del destinatario')
    if (!recipient.phone.trim()) return toast.error('Ingresa el teléfono para enviar por WhatsApp')
    if (!whatsappMessage) return toast.error('No se pudo armar el mensaje')
    persistRecipientProfile()
    const url = waMeUrl(recipient.phone, whatsappMessage)
    if (!url) return toast.error('Teléfono inválido para WhatsApp')
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.success('Abriendo WhatsApp…')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar enlace de agendación"
      testId="booking-link-modal"
      xlarge
      bodyClassName="max-h-[min(85vh,900px)] overflow-y-auto"
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <div className="min-w-0 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Cliente destino</label>
            <CustomerPicker
              value={customer}
              onChange={applyCustomer}
              branchId={branchId}
              allowManualEntry
              manualEntryLabel="Sin cliente en lista (escribir manualmente)"
              testIdPrefix="booking-link-customer"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Solo necesitas nombre y teléfono para WhatsApp. El documento es opcional aquí; el cliente lo ingresa al agendar.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Datos del destinatario</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nombre <span className="text-red-500">*</span>
              </label>
              <Input
                value={recipient.name}
                onChange={(e) => setRecipientField('name', e.target.value)}
                placeholder="Nombre completo"
                data-testid="booking-link-name"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tipo doc. (opcional)</label>
                <Select
                  value={recipient.docType}
                  onChange={(v) => setRecipientField('docType', v)}
                  options={DOC_TYPES.map((d) => ({ value: d.id, label: d.label }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Documento (opcional)</label>
                <Input
                  value={recipient.documentId}
                  onChange={(e) => setRecipientField('documentId', e.target.value)}
                  onBlur={tryAutofillFromDocument}
                  placeholder={recipient.docType === 'cedula' ? '001-1234567-8' : 'Pasaporte'}
                  data-testid="booking-link-document"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Correo (perfil)</label>
                <Input
                  type="email"
                  value={recipient.email}
                  onChange={(e) => setRecipientField('email', e.target.value)}
                  placeholder="opcional"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Teléfono <span className="text-red-500">*</span>
                </label>
                <Input
                  value={recipient.phone}
                  onChange={(e) => setRecipientField('phone', e.target.value)}
                  placeholder="809-555-0000"
                  data-testid="booking-link-phone"
                />
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Enlace público</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={bookingUrl} className="min-w-0 text-xs sm:flex-1" />
              <Button variant="secondary" onClick={copyLink} data-testid="booking-link-copy" className="shrink-0 sm:w-auto">
                <Copy className="h-4 w-4" />
                <span className="sm:hidden">Copiar</span>
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              onClick={sendWhatsApp}
              data-testid="booking-link-send"
              className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
            >
              <MessageCircle className="h-4 w-4" /> Enviar WhatsApp
            </Button>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:w-auto"
            >
              <ExternalLink className="h-4 w-4" /> Abrir enlace
            </a>
          </div>
        </div>

        <div className="xl:sticky xl:top-0">
          <WhatsAppPreviewPanel
            message={whatsappMessage}
            emptyHint="Escribe el nombre del destinatario para ver el mensaje."
          />
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Los correos se reservan para confirmación de citas y gestión (cancelar o reagendar) desde el perfil del cliente.
          </p>
        </div>
      </div>
    </Modal>
  )
}
