import { FileText, Phone, Mail, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

function Collapse({ open, children }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}

function InviteCard({ icon: Icon, title, subtitle, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-start gap-3 rounded-2xl border border-dashed border-[#c4b8a8] bg-[#f5f0e8]/80 p-4 text-left transition hover:border-[#a89880] hover:bg-[#f5f0e8]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        {subtitle ? <span className="mt-0.5 block text-xs text-slate-500">{subtitle}</span> : null}
      </span>
    </button>
  )
}

function ExpandedCard({ icon: Icon, title, onRemove, children, testId }) {
  return (
    <div
      className="rounded-2xl border border-[#e8dfd3] bg-[#f5f0e8]/90 p-4 shadow-sm"
      data-testid={testId}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold text-slate-900">{title}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <X className="mr-0.5 inline h-3.5 w-3.5" /> Quitar
        </button>
      </div>
      {children}
    </div>
  )
}

export function OptionalPreferenceCards({
  wantsInvoice,
  wantsContact,
  onToggleInvoice,
  onToggleContact,
  email,
  onEmailChange,
  phone,
  onPhoneChange,
}) {
  return (
    <div className="space-y-3">
      <Collapse open={!wantsInvoice}>
        <InviteCard
          icon={FileText}
          title="Quiero recibir factura"
          subtitle="Te enviamos comprobante y avisos de pago por correo"
          onClick={onToggleInvoice}
          testId="pref-invite-invoice"
        />
      </Collapse>
      <Collapse open={wantsInvoice}>
        <ExpandedCard
          icon={Mail}
          title="Correo para factura"
          onRemove={onToggleInvoice}
          testId="pref-expanded-invoice"
        >
          <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="Ej: juan@example.com"
            data-testid="self-email"
          />
        </ExpandedCard>
      </Collapse>

      <Collapse open={!wantsContact}>
        <InviteCard
          icon={Phone}
          title="Quiero que el comercio me pueda contactar"
          onClick={onToggleContact}
          testId="pref-invite-contact"
        />
      </Collapse>
      <Collapse open={wantsContact}>
        <ExpandedCard
          icon={Phone}
          title="Teléfono de contacto"
          onRemove={onToggleContact}
          testId="pref-expanded-contact"
        >
          <label className="mb-1 block text-xs font-medium text-slate-600">Teléfono</label>
          <Input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="Ej: (829) 709-0982"
            data-testid="self-phone"
          />
        </ExpandedCard>
      </Collapse>
    </div>
  )
}
