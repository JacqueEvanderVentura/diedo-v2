import { useMemo, useState, useEffect } from 'react'
import { Link, useSearchParams, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarClock, MessageSquare, CreditCard, ArrowLeft, Send } from 'lucide-react'
import { DiedoIcon } from '@/components/brand/DiedoIcon'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useAgendaStore, statusMeta, todayKey } from '@/stores/agendaStore'
import { useSelfBookingStore, recallDocument } from '@/stores/selfBookingStore'
import { fmtDate } from '@/modules/crm/lib/crm'
import { cn } from '@/lib/utils'

export default function PerfilPublicoPage() {
  const [params] = useSearchParams()
  const docParam = params.get('doc') || recallDocument()
  const lookupByDocument = useSelfBookingStore((s) => s.lookupByDocument)
  const upsertProfile = useSelfBookingStore((s) => s.upsertProfile)
  const addClaim = useSelfBookingStore((s) => s.addClaim)
  const getClaimsForProfile = useSelfBookingStore((s) => s.getClaimsForProfile)
  const appointments = useAgendaStore((s) => s.appointments)

  const profile = useMemo(() => (docParam ? lookupByDocument(docParam) : null), [docParam, lookupByDocument])

  const [form, setForm] = useState(null)
  const [claimType, setClaimType] = useState('general')
  const [claimApt, setClaimApt] = useState('')
  const [claimMsg, setClaimMsg] = useState('')

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        wantsInvoice: profile.wantsInvoice,
        wantsContact: profile.wantsContact,
      })
    }
  }, [profile])

  const customerAppointments = useMemo(() => {
    if (!profile?.customerId) return []
    return appointments
      .filter((a) => a.customerId === profile.customerId)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  }, [appointments, profile])

  const upcoming = customerAppointments.filter((a) => a.date >= todayKey())
  const past = customerAppointments.filter((a) => a.date < todayKey())
  const claims = profile ? getClaimsForProfile(profile.id) : []

  if (!docParam) return <Navigate to="/agendar" replace />
  if (!profile || !form) {
    return (
      <Shell>
        <p className="text-center text-slate-600">No encontramos un perfil con ese documento.</p>
        <Link to="/agendar" className="mt-4 block text-center text-sm font-semibold text-blue-600">
          Ir a agendar cita
        </Link>
      </Shell>
    )
  }

  const saveProfile = () => {
    upsertProfile({ ...profile, ...form })
    toast.success('Perfil actualizado')
  }

  const submitClaim = () => {
    if (!claimMsg.trim()) return toast.error('Escribe tu reclamo')
    addClaim({
      profileId: profile.id,
      documentId: profile.documentId,
      appointmentId: claimType === 'appointment' ? claimApt : null,
      type: claimType,
      message: claimMsg,
    })
    setClaimMsg('')
    toast.success('Reclamo enviado')
  }

  return (
    <Shell>
      <Link to="/agendar" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Agendar nueva cita
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
          {profile.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="font-heading text-xl font-bold text-slate-900">{profile.name}</h1>
          <p className="text-sm text-slate-500">Documento {profile.documentId}</p>
        </div>
      </div>

      <section className="mb-6 space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
        <h2 className="font-semibold text-slate-900">Mis datos</h2>
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" />
        <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Teléfono" />
        <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Dirección" />
        <Button onClick={saveProfile} data-testid="profile-save">Guardar cambios</Button>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <CalendarClock className="h-4 w-4 text-blue-500" /> Mis citas
        </h2>
        {upcoming.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Próximas</p>
            <ul className="space-y-2" data-testid="profile-upcoming">
              {upcoming.map((a) => (
                <AppointmentRow key={a.id} apt={a} />
              ))}
            </ul>
          </div>
        )}
        {past.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Historial</p>
            <ul className="space-y-2" data-testid="profile-past">
              {past.map((a) => (
                <AppointmentRow key={a.id} apt={a} muted />
              ))}
            </ul>
          </div>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no tienes citas registradas.</p>
        ) : null}
      </section>

      <section className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <MessageSquare className="h-4 w-4 text-violet-500" /> Reclamos
        </h2>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[
            { id: 'general', label: 'Reclamo general' },
            { id: 'appointment', label: 'Sobre una cita' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setClaimType(t.id)}
              className={cn(
                'rounded-xl border px-3 py-2 text-xs font-semibold',
                claimType === t.id ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {claimType === 'appointment' && customerAppointments.length > 0 && (
          <Select
            value={claimApt}
            onChange={setClaimApt}
            placeholder="Seleccionar cita"
            options={customerAppointments.map((a) => ({
              value: a.id,
              label: `${fmtDate(a.date)} · ${a.serviceName || 'Cita'}`,
            }))}
            className="mb-3"
          />
        )}
        <Input value={claimMsg} onChange={(e) => setClaimMsg(e.target.value)} placeholder="Describe tu reclamo..." />
        <Button className="mt-3" variant="secondary" onClick={submitClaim} data-testid="profile-claim">
          <Send className="h-4 w-4" /> Enviar reclamo
        </Button>
        {claims.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            {claims.map((c) => (
              <li key={c.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="text-slate-700">{c.message}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString('es-DO')} · {c.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center">
        <CreditCard className="mx-auto h-8 w-8 text-slate-300" />
        <h2 className="mt-2 font-semibold text-slate-700">Pagos en línea</h2>
        <p className="mt-1 text-sm text-slate-400">Próximamente podrás ver y pagar tus facturas desde aquí.</p>
      </section>
    </Shell>
  )
}

function AppointmentRow({ apt, muted }) {
  const st = statusMeta(apt.status)
  return (
    <li className={cn('flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm', muted && 'opacity-75')}>
      <span className="text-slate-700">
        {fmtDate(apt.date)} · {apt.time} · {apt.serviceName || 'Cita'}
        {apt.source === 'self' && <span className="ml-1 text-[10px] text-blue-500">(en línea)</span>}
      </span>
      <Badge tone={st.tone}>{st.name}</Badge>
    </li>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/20">
      <header className="border-b border-white/60 bg-white/80 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <DiedoIcon />
          <span className="font-heading font-bold text-slate-900">Mi perfil</span>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-8">{children}</main>
    </div>
  )
}
