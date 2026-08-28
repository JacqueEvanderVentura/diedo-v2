import { useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FileText, Phone, MapPin, Calendar, CheckCircle2, ChevronRight } from 'lucide-react'
import { DiedoIcon } from '@/components/brand/DiedoIcon'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { useAgendaStore } from '@/stores/agendaStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useSelfBookingStore, rememberDocument } from '@/stores/selfBookingStore'
import { useBranchStaff } from '@/modules/rrhh/lib/staff'
import { formatDOP } from '@/lib/format'
import { formatLongDate, endTime } from '../lib/calendar'
import { DOC_TYPES, normalizeDocumentId, formatDocumentDisplay, getAvailableSlots } from '../lib/selfBooking'
import { todayKey } from '@/stores/agendaStore'
import { cn } from '@/lib/utils'

const STEPS = ['Identificación', 'Datos', 'Cita', 'Confirmación']

export default function AgendarPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') || 'charm-dn'
  const branches = useConfigStore((s) => s.branches)
  const products = useCatalogStore((s) => s.products)
  const appointments = useAgendaStore((s) => s.appointments)
  const employees = useRrhhStore((s) => s.employees)
  const vacationRequests = useRrhhStore((s) => s.vacationRequests)
  const lookupByDocument = useSelfBookingStore((s) => s.lookupByDocument)
  const upsertProfile = useSelfBookingStore((s) => s.upsertProfile)
  const bookAppointment = useSelfBookingStore((s) => s.bookAppointment)

  const branch = branches.find((b) => b.id === branchId) || branches[0]
  const branchStaff = useBranchStaff(branch?.id || branchId)
  const services = useMemo(() => products.filter((p) => p.type === 'service').slice(0, 8), [products])

  const [step, setStep] = useState(0)
  const [lookup, setLookup] = useState('')
  const [form, setForm] = useState({
    docType: 'cedula',
    documentId: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    wantsInvoice: false,
    wantsContact: false,
    serviceId: '',
    employeeId: '',
    date: todayKey(),
    time: '',
  })
  const [done, setDone] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const service = services.find((s) => s.id === form.serviceId)
  const selectedEmployee = employees.find((e) => e.id === form.employeeId)

  const slots = useMemo(
    () =>
      form.employeeId && form.date
        ? getAvailableSlots({
            date: form.date,
            employeeId: form.employeeId,
            duration: 30,
            appointments,
            employee: selectedEmployee,
            vacationRequests,
          })
        : [],
    [form.employeeId, form.date, appointments, selectedEmployee, vacationRequests]
  )

  const lookupDoc = () => {
    const key = normalizeDocumentId(lookup)
    if (key.length < 5) return toast.error('Ingresa un documento válido')
    const found = lookupByDocument(key)
    if (found) {
      setForm((f) => ({
        ...f,
        docType: found.docType,
        documentId: found.documentId,
        name: found.name,
        email: found.email,
        phone: found.phone,
        address: found.address,
        wantsInvoice: found.wantsInvoice,
        wantsContact: found.wantsContact,
      }))
      toast.success(`Bienvenida de nuevo, ${found.name}`)
    } else {
      set('documentId', key)
      toast.message('Documento nuevo — completa tus datos')
    }
    setStep(1)
  }

  const saveProfile = () => {
    if (!form.name.trim()) return toast.error('Ingresa tu nombre')
    if (!normalizeDocumentId(form.documentId)) return toast.error('Ingresa tu documento')
    if (form.wantsInvoice && !form.email.trim()) return toast.error('El email es requerido para factura')
    if (form.wantsContact && !form.phone.trim()) return toast.error('El teléfono es requerido para contacto')
    upsertProfile(form)
    setStep(2)
  }

  const pickSlot = (time) => {
    if (!form.serviceId) return toast.error('Selecciona un servicio')
    set('time', time)
    setStep(3)
  }

  const confirm = () => {
    if (!service || !form.time) return toast.error('Completa la cita')
    const profile = upsertProfile(form)
    bookAppointment({
      profile,
      branchId: branch.id,
      service,
      date: form.date,
      time: form.time,
      employeeId: form.employeeId,
      duration: 30,
    })
    rememberDocument(profile.documentId)
    setDone(true)
    toast.success('¡Cita agendada!')
  }

  if (done) {
    return (
      <PublicShell branchName={branch?.name}>
        <div className="mx-auto max-w-md text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <h1 className="mt-4 font-heading text-2xl font-bold text-slate-900">¡Cita confirmada!</h1>
          <p className="mt-2 text-slate-600">
            {service?.name} · {formatLongDate(form.date)} · {form.time}
          </p>
          <p className="mt-4 text-sm text-slate-500">Recibirás un correo de confirmación (simulado).</p>
          <Link
            to={`/agendar/perfil?doc=${normalizeDocumentId(form.documentId)}`}
            className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Gestionar mi perfil
          </Link>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell branchName={branch?.name}>
      <div className="mx-auto max-w-lg">
        <Stepper current={step} />

        {step === 0 && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Identifícate</h2>
            <p className="text-sm text-slate-500">Ingresa tu cédula o documento para continuar.</p>
            <Input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="001-1234567-8"
              data-testid="self-doc-lookup"
            />
            <Button className="w-full" onClick={lookupDoc}>
              Continuar <ChevronRight className="h-4 w-4" />
            </Button>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Tus datos</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tipo doc.</label>
                <Select value={form.docType} onChange={(v) => set('docType', v)} options={DOC_TYPES.map((d) => ({ value: d.id, label: d.label }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Documento</label>
                <Input value={form.documentId} onChange={(e) => set('documentId', e.target.value)} data-testid="self-document" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nombre completo</label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} data-testid="self-name" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <PreferenceCard
                icon={FileText}
                title="Quiero recibir factura"
                active={form.wantsInvoice}
                onClick={() => set('wantsInvoice', !form.wantsInvoice)}
              />
              <PreferenceCard
                icon={Phone}
                title="Quiero que me contacten"
                active={form.wantsContact}
                onClick={() => set('wantsContact', !form.wantsContact)}
              />
            </div>

            {form.wantsInvoice && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Correo electrónico</label>
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="tu@email.com" />
              </div>
            )}
            {form.wantsContact && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Teléfono</label>
                <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="809-555-0000" />
              </div>
            )}

            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> Dirección (opcional)
              </label>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Sector, ciudad" />
            </div>

            <Button className="w-full" onClick={saveProfile} data-testid="self-save-profile">
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Elige tu cita</h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Servicio</label>
              <Select
                value={form.serviceId}
                onChange={(v) => set('serviceId', v)}
                placeholder="Seleccionar servicio"
                options={services.map((s) => ({ value: s.id, label: `${s.name} — ${formatDOP(s.price)}` }))}
                data-testid="self-service"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Fecha</label>
                <Input type="date" min={todayKey()} value={form.date} onChange={(e) => set('date', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Especialista</label>
                <Select
                  value={form.employeeId}
                  onChange={(v) => set('employeeId', v)}
                  options={branchStaff.map((e) => ({ value: e.id, label: e.name.split(' ').slice(0, 2).join(' ') }))}
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-500">Horarios disponibles</label>
              {slots.length === 0 ? (
                <p className="text-sm text-slate-400">No hay cupos para esta fecha.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => pickSlot(slot)}
                      className={cn(
                        'rounded-lg border px-2 py-2 text-sm font-semibold transition-colors',
                        form.time === slot ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-blue-200'
                      )}
                      data-testid={`self-slot-${slot}`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {step === 3 && service && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Confirmar</h2>
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <p><span className="text-slate-400">Cliente:</span> <strong>{form.name}</strong></p>
              <p><span className="text-slate-400">Documento:</span> {formatDocumentDisplay(form.documentId)}</p>
              <p><span className="text-slate-400">Servicio:</span> {service.name} · {formatDOP(service.price)}</p>
              <p className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-500" />
                <span className="capitalize">{formatLongDate(form.date)}</span> · {form.time} – {endTime(form.time, 30)}
              </p>
              <p><span className="text-slate-400">Sucursal:</span> {branch?.name}</p>
            </div>
            <Button className="w-full" onClick={confirm} data-testid="self-confirm">
              Confirmar cita
            </Button>
            <button type="button" onClick={() => setStep(2)} className="w-full text-sm text-slate-500 hover:text-slate-700">
              Cambiar horario
            </button>
          </section>
        )}
      </div>
    </PublicShell>
  )
}

function PublicShell({ branchName, children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/20">
      <header className="border-b border-white/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4 sm:max-w-2xl">
          <div className="flex items-center gap-3">
            <DiedoIcon />
            <div>
              <p className="font-heading font-bold text-slate-900">Agenda en línea</p>
              <p className="text-xs text-slate-500">{branchName}</p>
            </div>
          </div>
        </div>
      </header>
      <main className="px-4 py-8">{children}</main>
    </div>
  )
}

function Stepper({ current }) {
  return (
    <ol className="mb-8 flex justify-between gap-1">
      {STEPS.map((label, i) => (
        <li key={label} className="flex-1 text-center">
          <div
            className={cn(
              'mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
              i <= current ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
            )}
          >
            {i + 1}
          </div>
          <span className={cn('hidden text-[10px] font-medium sm:block', i <= current ? 'text-blue-600' : 'text-slate-400')}>
            {label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function PreferenceCard({ icon: Icon, title, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 text-left transition-colors',
        active ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
      )}
    >
      <Icon className={cn('h-5 w-5', active ? 'text-blue-600' : 'text-slate-400')} />
      <p className="mt-2 text-xs font-semibold text-slate-700">{title}</p>
    </button>
  )
}
