import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Link2, Mail, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useSelfBookingStore } from '@/stores/selfBookingStore'
import { usePosStore } from '@/stores/posStore'
import { buildBookingUrl, buildProfileUrl, buildConfirmationEmail } from '../lib/selfBooking'

export function BookingLinkModal({ open, onClose, branchId, branchName }) {
  const customers = usePosStore((s) => s.customers)
  const profiles = useSelfBookingStore((s) => s.profiles)
  const lookupByDocument = useSelfBookingStore((s) => s.lookupByDocument)
  const sendBookingLinkEmail = useSelfBookingStore((s) => s.sendBookingLinkEmail)
  const queueEmail = useSelfBookingStore((s) => s.queueEmail)

  const [customerId, setCustomerId] = useState('')
  const [lastEmail, setLastEmail] = useState(null)

  const bookingUrl = buildBookingUrl(branchId)
  const customer = customers.find((c) => c.id === customerId)
  const profile =
    customer?.documentId
      ? lookupByDocument(customer.documentId)
      : profiles.find((p) => p.customerId === customerId) || null

  const emailPreview =
    profile && customer
      ? buildConfirmationEmail({
          profile: { ...profile, name: customer.name, email: profile.email || customer.email },
          branchName,
          bookingUrl,
          profileUrl: buildProfileUrl(profile.documentId),
        })
      : null

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const sendMockEmail = () => {
    if (!customer) return toast.error('Selecciona un cliente')
    if (!profile) {
      queueEmail({
        profileId: null,
        to: customer.phone || customer.name,
        kind: 'booking-link',
        subject: `Agenda tu cita en ${branchName}`,
        body: `Hola ${customer.name},\n\nReserva aquí: ${bookingUrl}`,
      })
      setLastEmail({ subject: `Agenda tu cita en ${branchName}`, body: `Hola ${customer.name},\n\nReserva aquí: ${bookingUrl}` })
      toast.success('Email simulado en cola')
      return
    }
    const email = sendBookingLinkEmail({ profile: { ...profile, name: customer.name }, branchId, branchName })
    setLastEmail(email)
    toast.success('Email simulado enviado')
  }

  return (
    <Modal open={open} onClose={onClose} title="Enviar enlace de agendación" testId="booking-link-modal" wide>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Cliente destino</label>
            <Select
              value={customerId}
              onChange={setCustomerId}
              placeholder="Seleccionar cliente"
              options={customers.filter((c) => !c.isDefault).map((c) => ({ value: c.id, label: c.name }))}
              data-testid="booking-link-customer"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Enlace público</label>
            <div className="flex gap-2">
              <Input readOnly value={bookingUrl} className="text-xs" />
              <Button variant="secondary" onClick={copyLink} data-testid="booking-link-copy">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={sendMockEmail} data-testid="booking-link-send">
              <Mail className="h-4 w-4" /> Simular envío
            </Button>
            <a href={bookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" /> Abrir enlace
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Link2 className="h-4 w-4 text-blue-500" /> Vista previa del email
          </div>
          {!emailPreview && !lastEmail ? (
            <p className="text-sm text-slate-400">Selecciona un cliente para ver la vista previa.</p>
          ) : (
            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Asunto</p>
              <p className="text-sm font-medium text-slate-800">{(lastEmail || emailPreview)?.subject}</p>
              <p className="text-xs font-semibold uppercase text-slate-400">Mensaje</p>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-600">
                {(lastEmail || emailPreview)?.body}
              </pre>
              {profile && (
                <a
                  href={buildProfileUrl(profile.documentId)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-semibold text-blue-600 hover:underline"
                >
                  Gestionar mi perfil →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
