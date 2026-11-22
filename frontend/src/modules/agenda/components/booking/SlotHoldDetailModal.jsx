import { Clock, User, Phone, Mail, Scissors } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { WhatsAppIcon } from '@/components/brand/WhatsAppIcon'
import { formatHoldCountdown } from '@/modules/agenda/lib/slotHoldCountdown'
import { formatLongDate, formatTime12h } from '@/modules/agenda/lib/calendar'
import {
  slotHoldWhatsAppUrl,
  unassignedContactLabel,
} from '@/modules/agenda/lib/slotHoldWhatsApp'

export function slotHoldCustomerLabel(hold) {
  const name = hold?.customerName?.trim()
  if (name) return name
  if (hold?.customerId) return 'Cliente identificado (sin nombre en el apartado)'
  return 'Cliente en línea (aún sin identificar)'
}

function ContactField({ icon: Icon, label, value, testId }) {
  const assigned = Boolean(value?.trim())
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
        <dd
          className={assigned ? 'font-medium text-slate-900' : 'italic text-slate-500'}
          data-testid={testId}
        >
          {unassignedContactLabel(value)}
        </dd>
      </div>
    </div>
  )
}

export function SlotHoldDetailModal({
  open,
  onClose,
  hold,
  resourceName = '',
  employeeName = '',
  nowMs = Date.now(),
}) {
  if (!hold) return null

  const countdown = formatHoldCountdown(hold.expiresAt, nowMs)
  const customerLabel = slotHoldCustomerLabel(hold)
  const whatsappUrl = slotHoldWhatsAppUrl(hold)

  const openWhatsApp = () => {
    if (!whatsappUrl) return
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apartado en línea"
      testId="slot-hold-detail-modal"
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="font-medium text-amber-950">
            Este cupo está apartado temporalmente. Se libera en{' '}
            <span className="font-bold tabular-nums text-red-600">{countdown}</span> si no confirman.
          </p>
        </div>

        <dl className="space-y-3">
          <div className="flex gap-3">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cliente</dt>
              <dd className="font-medium text-slate-900" data-testid="slot-hold-customer-name">
                {customerLabel}
              </dd>
            </div>
          </div>

          <ContactField
            icon={Phone}
            label="Teléfono"
            value={hold.customerPhone}
            testId="slot-hold-customer-phone"
          />
          <ContactField
            icon={Mail}
            label="Correo"
            value={hold.customerEmail}
            testId="slot-hold-customer-email"
          />

          {hold.serviceName ? (
            <div className="flex gap-3">
              <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Servicio</dt>
                <dd className="font-medium text-slate-900">{hold.serviceName}</dd>
              </div>
            </div>
          ) : null}

          <div className="flex gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Horario</dt>
              <dd className="font-medium text-slate-900">
                {formatLongDate(hold.date)} · {formatTime12h(hold.time)}
                {resourceName ? ` · ${resourceName}` : ''}
                {employeeName ? ` · ${employeeName}` : ''}
              </dd>
            </div>
          </div>
        </dl>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {whatsappUrl ? (
            <Button
              type="button"
              variant="primary"
              className="bg-[#25D366] hover:bg-[#1ebe59] focus-visible:ring-[#25D366]"
              onClick={openWhatsApp}
              data-testid="slot-hold-whatsapp"
            >
              <WhatsAppIcon className="mr-2 h-4 w-4" />
              Enviar WhatsApp
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}