import { useState } from 'react'
import { toast } from 'sonner'
import { WhatsAppIcon } from '@/components/brand/WhatsAppIcon'
import { Button } from '@/components/ui/Button'
import {
  abandonedBookingSnapshot,
  canSendResumeBookingWhatsApp,
  resumeBookingWhatsAppUrl,
} from '@/modules/agenda/lib/slotHoldWhatsApp'
import { getSlotHoldResumeLink } from '@/services/notificationsApi'

/** "Enviar WhatsApp" for an abandoned (sin finalizar) booking; renders nothing without a phone. */
export function ResumeBookingWhatsAppButton({ notification, size = 'sm' }) {
  const [busy, setBusy] = useState(false)
  if (!canSendResumeBookingWhatsApp(notification)) return null
  const snapshot = abandonedBookingSnapshot(notification)

  const openWhatsApp = async () => {
    // Open the tab synchronously; opening it after the request would be blocked as a popup.
    const tab = window.open('about:blank', '_blank')
    setBusy(true)
    try {
      const resume = await getSlotHoldResumeLink(notification.id)
      const url = resumeBookingWhatsAppUrl({
        customerPhone: snapshot.customerPhone,
        customerName: snapshot.customerName,
        serviceName: snapshot.serviceName,
        date: resume.scheduledDate,
        time: resume.scheduledTime,
        resumeUrl: resume.resumeUrl,
      })
      if (!url) throw new Error('El teléfono del cliente no es válido.')
      if (!tab) {
        toast.error('Permite las ventanas emergentes para abrir WhatsApp.')
        return
      }
      tab.opener = null
      tab.location.href = url
    } catch (error) {
      tab?.close()
      toast.error(error.message || 'No se pudo preparar el mensaje de WhatsApp.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant="primary"
      className="bg-[#25D366] hover:bg-[#1ebe59] focus-visible:outline-[#25D366]"
      onClick={openWhatsApp}
      disabled={busy}
      data-testid="notification-resume-whatsapp"
    >
      <WhatsAppIcon className="h-3.5 w-3.5" />
      Enviar WhatsApp
    </Button>
  )
}
