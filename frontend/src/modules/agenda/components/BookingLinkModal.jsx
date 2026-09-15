import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, ExternalLink, MessageCircle, Mail } from 'lucide-react'
import { publicBookingApi } from '@/services/publicBookingApi'
import { useSessionStore } from '@/stores/sessionStore'
import { Modal } from '@/components/ui/Modal'
import { WhatsAppPreviewPanel } from '@/components/ui/WhatsAppPreviewPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InlineSetupCard } from '@/components/ui/InlineSetupCard'
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
  const isDemo = useSessionStore((s) => s.status) === 'demo'
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailMessage, setEmailMessage] = useState('')
  const [setup, setSetup] = useState(null)
  const [setupRevision, setSetupRevision] = useState(0)
  const sendAttempt = useRef(null)
  const emailBusy = useRef(false)

  const bookingUrl = buildBookingUrl(branchId)

  useEffect(() => {
    if (!open) return
    setCustomer(null)
    setRecipient(emptyRecipient())
    setEmailMessage('')
    sendAttempt.current = null
  }, [open])

  useEffect(() => {
    if (!open || isDemo || !branchId) return
    let active = true
    setSetup(null)
    publicBookingApi.getContext(branchId).then((context) => {
      if (active) setSetup(context)
    }).catch(() => { if (active) setSetup({ unavailable: true }) })
    return () => { active = false }
  }, [open, branchId, isDemo, setupRevision])

  useEffect(() => {
    if (!open) return
    const refresh = () => setSetupRevision((value) => value + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [open])

  const sendEmail = async () => {
    if (emailBusy.current) return
    const name = recipient.name.trim()
    const email = recipient.email.trim()
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailMessage('Ingresa un nombre y correo válidos para enviar el enlace.')
      return
    }
    if (isDemo) {
      setEmailMessage('Modo demo: no se envían correos reales.')
      return
    }
    const payload = { branchId, name, email }
    const fingerprint = JSON.stringify(payload)
    if (sendAttempt.current?.fingerprint !== fingerprint) sendAttempt.current = { fingerprint, key: crypto.randomUUID() }
    emailBusy.current = true
    setSendingEmail(true)
    setEmailMessage('Enviando correo…')
    try {
      const result = await publicBookingApi.sendBookingLink(payload, sendAttempt.current.key)
      setEmailMessage(result.status === 'sent'
        ? 'Correo aceptado por el proveedor. El destinatario puede revisar su bandeja y spam.'
        : result.message || 'El correo quedó pendiente. No se ha confirmado el envío.')
    } catch (error) {
      setEmailMessage(error.message || 'No se pudo enviar el correo. Puedes reintentar.')
    } finally {
      emailBusy.current = false
      setSendingEmail(false)
    }
  }

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

  const documentKey = normalizeDocumentId(recipient.documentId, recipient.docType)

  useEffect(() => {
    if (!documentKey) return
    const found = lookupByDocument(documentKey, recipient.docType)
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
  }, [documentKey, recipient.docType, lookupByDocument])

  const tryAutofillFromDocument = () => {
    if (!documentKey) return
    const found = lookupByDocument(documentKey, recipient.docType)
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
      onClose={() => { if (!sendingEmail) onClose() }}
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
                <label className="mb-1 block text-xs font-medium text-slate-500">Correo para enviar el enlace</label>
                <Input
                  type="email"
                  data-testid="booking-link-email"
                  value={recipient.email}
                  onChange={(e) => setRecipientField('email', e.target.value)}
                  placeholder="opcional"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Teléfono (para WhatsApp)
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
              <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
            </Button>
            <Button onClick={sendEmail} disabled={sendingEmail} data-testid="booking-link-send-email">
              <Mail className="h-4 w-4" /> {sendingEmail ? 'Enviando…' : 'Enviar por correo'}
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
          {emailMessage && <p role="status" data-testid="booking-link-email-result" className="text-sm text-slate-600">{emailMessage}</p>}
          {setup && (setup.unavailable || !setup.specialists?.length || !setup.hasResources) && (
            <InlineSetupCard
              testId="booking-link-setup"
              title="Revisar configuración de agendación"
              message={setup.unavailable ? 'No se pudo comprobar la configuración de la sucursal.' : !setup.specialists?.length
                ? 'Esta sucursal no tiene especialistas habilitados. En RR. HH., edita el empleado, verifica su sucursal y activa “Seleccionable como especialista”.'
                : 'Esta sucursal no tiene cabinas activas. Solicita al administrador configurar una cabina y vuelve a comprobar.'}
              actionLabel={!setup.unavailable && !setup.specialists?.length ? 'Configurar especialistas de esta sucursal' : 'Comprobar configuración'}
              onAction={() => {
                if (!setup.unavailable && !setup.specialists?.length) {
                  window.open(`/rrhh/directorio?branch=${encodeURIComponent(branchId)}&booking=1`, '_blank', 'noopener,noreferrer')
                } else setSetupRevision((value) => value + 1)
              }}
            />
          )}
        </div>

        <div className="xl:sticky xl:top-0">
          <WhatsAppPreviewPanel
            message={whatsappMessage}
            emptyHint="Escribe el nombre del destinatario para ver el mensaje."
          />
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Puedes compartir el enlace por correo, WhatsApp o ambos. El cliente recibirá los avisos de su cita si proporciona un correo.
          </p>
        </div>
      </div>
    </Modal>
  )
}
