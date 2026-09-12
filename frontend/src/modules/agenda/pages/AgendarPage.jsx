import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FileText, Phone, MapPin, Calendar, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react'
import { HeliosIcon } from '@/components/brand/HeliosIcon'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { useConfigStore } from '@/stores/configStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { useAvailabilityAppointments } from '../hooks/useAvailabilityAppointments'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useSelfBookingStore, rememberDocument } from '@/stores/selfBookingStore'
import { useSessionStore } from '@/stores/sessionStore'
import { publicBookingApi } from '@/services/publicBookingApi'
import { useBranchBookableStaff } from '@/modules/rrhh/lib/staff'
import { formatDOP } from '@/lib/format'
import { formatLongDate, endTime } from '../lib/calendar'
import {
  DOC_TYPES,
  normalizeDocumentId,
  formatDocumentDisplay,
  formatDocumentInput,
  getAvailableSlots,
  isSlotAvailable,
} from '../lib/selfBooking'
import { todayKey } from '@/stores/agendaStore'
import { cn } from '@/lib/utils'

const STEPS = ['Identificación', 'Datos', 'Cita', 'Confirmación']

export default function AgendarPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') || 'charm-dn'
  const branches = useConfigStore((s) => s.branches)
  const products = useCatalogStore((s) => s.products)
  const employees = useRrhhStore((s) => s.employees)
  const vacationRequests = useRrhhStore((s) => s.vacationRequests)
  const dataMode = useSessionStore((s) => s.status)
  const isDemo = dataMode === 'demo'
  const lookupByDocument = useSelfBookingStore((s) => s.lookupByDocument)
  const identifyRemote = useSelfBookingStore((s) => s.identifyRemote)
  const fetchRemoteSlots = useSelfBookingStore((s) => s.fetchRemoteSlots)
  const upsertProfile = useSelfBookingStore((s) => s.upsertProfile)
  const bookAppointment = useSelfBookingStore((s) => s.bookAppointment)

  const branch = branches.find((b) => b.id === branchId) || branches[0]
  const [step, setStep] = useState(0)
  const [lookupDocType, setLookupDocType] = useState('cedula')
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
  const [remoteServices, setRemoteServices] = useState(null)
  const [remoteSpecialists, setRemoteSpecialists] = useState(null)
  const [remoteSlots, setRemoteSlots] = useState(null)

  const localBookableStaff = useBranchBookableStaff(branch?.id || branchId)
  const services = useMemo(() => {
    if (remoteServices) return remoteServices
    return products.filter((p) => p.type === 'service').slice(0, 8)
  }, [products, remoteServices])
  const bookableStaff = useMemo(() => {
    if (remoteSpecialists?.length) {
      return remoteSpecialists.map((member) => ({
        id: member.id,
        name: member.displayName,
        firstName: member.displayName,
        lastName: '',
      }))
    }
    return localBookableStaff
  }, [localBookableStaff, remoteSpecialists])
  const service = services.find((s) => s.id === form.serviceId)
  const selectedEmployee = employees.find((e) => e.id === form.employeeId)
  const appointmentDuration = service?.durationMinutes || service?.duration || 30

  const appointments = useAvailabilityAppointments(isDemo ? form.date : null, isDemo ? form.employeeId : null)

  useEffect(() => {
    if (isDemo || !branch?.id) return
    publicBookingApi.getContext(branch.id)
      .then((context) => {
        setRemoteServices(
          (context.services || []).map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price || 0),
            type: 'service',
            durationMinutes: item.durationMinutes || 30,
          }))
        )
        setRemoteSpecialists(context.specialists || [])
      })
      .catch(() => {})
  }, [branch?.id, isDemo])

  useEffect(() => {
    if (isDemo || !branch?.id || !form.employeeId || !form.date) return
    fetchRemoteSlots({
      branchId: branch.id,
      date: form.date,
      employeeId: form.employeeId,
      duration: appointmentDuration,
    })
      .then((slots) => setRemoteSlots(slots))
      .catch(() => setRemoteSlots([]))
  }, [appointmentDuration, branch?.id, fetchRemoteSlots, form.date, form.employeeId, isDemo])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!form.employeeId) return
    if (!bookableStaff.some((member) => member.id === form.employeeId)) {
      set('employeeId', bookableStaff[0]?.id || '')
    }
  }, [bookableStaff, form.employeeId])

  const slots = useMemo(() => {
    if (!form.employeeId || !form.date) return []
    if (!isDemo && remoteSlots) return remoteSlots
    return getAvailableSlots({
      date: form.date,
      employeeId: form.employeeId,
      duration: appointmentDuration,
      appointments,
      employee: selectedEmployee,
      vacationRequests,
    })
  }, [form.employeeId, form.date, appointments, selectedEmployee, vacationRequests, appointmentDuration, isDemo, remoteSlots])

  const lookupDoc = async () => {
    const key = normalizeDocumentId(lookup)
    if (lookupDocType === 'cedula' && key.length !== 11) {
      return toast.error('Ingresa una cédula válida (11 dígitos)')
    }
    if (lookupDocType === 'pasaporte' && key.length < 5) {
      return toast.error('Ingresa un documento válido')
    }
    const found = isDemo ? lookupByDocument(key) : await identifyRemote(branch?.id || branchId, lookupDocType, key)
    if (found) {
      setForm((f) => ({
        ...f,
        docType: found.docType || lookupDocType,
        documentId: formatDocumentInput(found.documentId, found.docType || lookupDocType),
        name: found.name,
        email: found.email,
        phone: found.phone,
        address: found.address,
        wantsInvoice: found.wantsInvoice,
        wantsContact: found.wantsContact,
      }))
      toast.success(`Bienvenida de nuevo, ${found.name}`)
      setStep(2)
      return
    }
    setForm((f) => ({
      ...f,
      docType: lookupDocType,
      documentId: formatDocumentInput(key, lookupDocType),
    }))
    toast.message('Documento nuevo — completa tus datos')
    setStep(1)
  }

  const saveProfile = () => {
    if (!form.name.trim()) return toast.error('Ingresa tu nombre')
    const docKey = normalizeDocumentId(form.documentId)
    if (!docKey) return toast.error('Ingresa tu documento')
    if (form.docType === 'cedula' && docKey.length !== 11) {
      return toast.error('La cédula debe tener 11 dígitos')
    }
    if (form.wantsInvoice && !form.email.trim()) return toast.error('El email es requerido para factura')
    if (form.wantsContact && !form.phone.trim()) return toast.error('El teléfono es requerido para contacto')
    upsertProfile({ ...form, documentId: docKey })
    setStep(2)
  }

  const pickSlot = (time) => {
    if (!form.serviceId) return toast.error('Selecciona un servicio')
    set('time', time)
    setStep(3)
  }

  const confirm = async () => {
    if (!service || !form.time) return toast.error('Completa la cita')
    const stillAvailable = isSlotAvailable({
      date: form.date,
      employeeId: form.employeeId,
      duration: appointmentDuration,
      time: form.time,
      appointments,
      employee: selectedEmployee,
      vacationRequests,
    })
    if (isDemo && !stillAvailable) return toast.error('Ese horario ya no está disponible. Elige otro cupo.')
    if (!isDemo && remoteSlots && !remoteSlots.includes(form.time)) {
      return toast.error('Ese horario ya no está disponible. Elige otro cupo.')
    }
    const profile = upsertProfile(form)
    try {
      await bookAppointment({
        profile,
        branchId: branch.id,
        service,
        date: form.date,
        time: form.time,
        employeeId: form.employeeId,
        duration: appointmentDuration,
      })
      rememberDocument(profile.documentId)
      setDone(true)
      toast.success('¡Cita agendada!')
    } catch (error) {
      toast.error(error.message || 'No se pudo agendar la cita')
    }
  }

  const goBack = () => setStep((current) => Math.max(0, current - 1))

  if (done) {
    return (
      <PublicShell branchName={branch?.name}>
        <div className="mx-auto max-w-md text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <h1 className="mt-4 font-heading text-2xl font-bold text-slate-900">¡Cita confirmada!</h1>
          <p className="mt-2 text-slate-600">
            {service?.name} · {formatLongDate(form.date)} · {form.time}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            {isDemo ? 'Recibirás un correo de confirmación (simulado).' : 'Recibirás un correo de confirmación si indicaste email.'}
          </p>
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
            <p className="text-sm text-slate-500">Ingresa tu documento para continuar. Si ya estás registrado, pasarás directo a elegir cita.</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tipo de documento</label>
              <Select
                value={lookupDocType}
                onChange={(v) => {
                  setLookupDocType(v)
                  setLookup(formatDocumentInput(lookup, v))
                }}
                options={DOC_TYPES.map((d) => ({ value: d.id, label: d.label }))}
                data-testid="self-doc-type"
              />
            </div>
            <Input
              value={lookup}
              onChange={(e) => setLookup(formatDocumentInput(e.target.value, lookupDocType))}
              placeholder={lookupDocType === 'cedula' ? '001-1234567-8' : 'Número de pasaporte'}
              inputMode={lookupDocType === 'cedula' ? 'numeric' : 'text'}
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
                <Select
                  value={form.docType}
                  onChange={(v) => {
                    set('docType', v)
                    set('documentId', formatDocumentInput(form.documentId, v))
                  }}
                  options={DOC_TYPES.map((d) => ({ value: d.id, label: d.label }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Documento</label>
                <Input
                  value={form.documentId}
                  onChange={(e) => set('documentId', formatDocumentInput(e.target.value, form.docType))}
                  data-testid="self-document"
                />
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

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={goBack}>
                <ChevronLeft className="h-4 w-4" /> Atrás
              </Button>
              <Button className="flex-[2]" onClick={saveProfile} data-testid="self-save-profile">
                Siguiente <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Elige tu cita</h2>
            <p className="text-xs text-slate-500">Los horarios se actualizan según el horario del especialista y las citas ya reservadas.</p>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Fecha</label>
                <DatePicker
                  value={form.date}
                  onChange={(date) => {
                    set('date', date)
                    set('time', '')
                  }}
                  minDate={todayKey()}
                  testId="self-booking-date"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Especialista</label>
                <Select
                  value={form.employeeId}
                  onChange={(v) => {
                    set('employeeId', v)
                    set('time', '')
                  }}
                  placeholder="Seleccionar especialista"
                  options={bookableStaff.map((e) => ({ value: e.id, label: e.name.split(' ').slice(0, 2).join(' ') }))}
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-500">Horarios disponibles</label>
              {!form.employeeId ? (
                <p className="text-sm text-slate-400">Selecciona un especialista.</p>
              ) : slots.length === 0 ? (
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
            <Button variant="secondary" className="w-full" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" /> Atrás
            </Button>
          </section>
        )}

        {step === 3 && service && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Confirmar</h2>
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <p><span className="text-slate-400">Cliente:</span> <strong>{form.name}</strong></p>
              <p><span className="text-slate-400">Documento:</span> {formatDocumentDisplay(form.documentId, form.docType)}</p>
              <p><span className="text-slate-400">Servicio:</span> {service.name} · {formatDOP(service.price)}</p>
              <p className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-500" />
                <span className="capitalize">{formatLongDate(form.date)}</span> · {form.time} – {endTime(form.time, appointmentDuration)}
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
            <HeliosIcon />
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
