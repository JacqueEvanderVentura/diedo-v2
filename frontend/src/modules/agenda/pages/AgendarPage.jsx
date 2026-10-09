import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { MapPin, Calendar, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react'
import { HeliosIcon } from '@/components/brand/HeliosIcon'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { TimePicker } from '@/components/ui/TimePicker'
import { useConfigStore } from '@/stores/configStore'
import { isAgendaBookable, useCatalogStore } from '@/stores/catalogStore'
import { useAvailabilityAppointments } from '../hooks/useAvailabilityAppointments'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useSelfBookingStore, rememberDocument } from '@/stores/selfBookingStore'
import { OptionalPreferenceCards } from '@/modules/portal/components/OptionalPreferenceCards'
import { rememberPublicSession, recallPublicSession } from '@/modules/portal/lib/publicSession'
import { publicPortalApi } from '@/services/publicPortalApi'
import { useSessionStore } from '@/stores/sessionStore'
import { publicBookingApi } from '@/services/publicBookingApi'
import { useBranchBookableStaff } from '@/modules/rrhh/lib/staff'
import { formatDOP } from '@/lib/format'
import { formatLongDate, endTime, formatTime12h } from '../lib/calendar'
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

import { durationLabel } from '@/data/agenda'
import { branchDateKey, emailResultMessage, managementUrl } from '../lib/notification'
import { applyBranchBookingDefaults, fetchLastVisitBookingDefaults } from '../lib/customerBookingDefaults'

const STEPS = ['Identificación', 'Datos', 'Cita', 'Confirmación']

export default function AgendarPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const requestedBranchId = params.get('branch')
  const intentBook = params.get('intent') === 'book'
  const branches = useConfigStore((s) => s.branches)
  const products = useCatalogStore((s) => s.products)
  const employees = useRrhhStore((s) => s.employees)
  const vacationRequests = useRrhhStore((s) => s.vacationRequests)
  const dataMode = useSessionStore((s) => s.status)
  const isDemo = dataMode === 'demo'
  const branchId = requestedBranchId || (isDemo ? 'charm-dn' : '')
  const lookupByDocument = useSelfBookingStore((s) => s.lookupByDocument)
  const identifyRemote = useSelfBookingStore((s) => s.identifyRemote)
  const fetchRemoteSlots = useSelfBookingStore((s) => s.fetchRemoteSlots)
  const upsertProfile = useSelfBookingStore((s) => s.upsertProfile)
  const bookAppointment = useSelfBookingStore((s) => s.bookAppointment)

  const [remoteBranch, setRemoteBranch] = useState(null)
  const [workspaceBranches, setWorkspaceBranches] = useState([])
  const [contextError, setContextError] = useState('')
  const hasSavedSession = Boolean(
    requestedBranchId && recallPublicSession()?.documentId && recallPublicSession()?.branchId === requestedBranchId
  )
  const [phase, setPhase] = useState(() => (intentBook && hasSavedSession ? 'booking' : 'branch'))
  const [explicitBranchPick, setExplicitBranchPick] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const branch = isDemo
    ? branches.find((b) => b.id === branchId) || branches[0]
    : remoteBranch?.id === branchId ? remoteBranch : null
  const [step, setStep] = useState(() => (intentBook && hasSavedSession ? 2 : 0))
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
    observaciones: '',
    serviceId: '',
    employeeId: '',
    date: todayKey(),
    time: '',
  })
  const [done, setDone] = useState(false)
  const [savedAppointment, setSavedAppointment] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const attemptRef = useRef(null)
  const restoredSessionDefaultsRef = useRef(false)
  const [slotLoading, setSlotLoading] = useState(false)
  const [slotError, setSlotError] = useState('')
  const [slotRevision, setSlotRevision] = useState(0)
  const [hasResources, setHasResources] = useState(true)
  const [remoteServices, setRemoteServices] = useState(null)
  const [remoteSpecialists, setRemoteSpecialists] = useState(null)
  const [remoteSlots, setRemoteSlots] = useState(null)

  const localBookableStaff = useBranchBookableStaff(branch?.id || branchId)
  const services = useMemo(() => {
    if (remoteServices) return remoteServices
    return products.filter((p) => isAgendaBookable(p)).slice(0, 8)
  }, [products, remoteServices])
  const bookableStaff = useMemo(() => {
    if (!isDemo) {
      return (remoteSpecialists || []).map((member) => ({
        id: member.id,
        name: member.displayName,
        firstName: member.displayName,
        lastName: '',
      }))
    }
    return localBookableStaff
  }, [isDemo, localBookableStaff, remoteSpecialists])
  const service = services.find((s) => s.id === form.serviceId)
  const selectedEmployee = employees.find((e) => e.id === form.employeeId)
  const appointmentDuration = Number(service?.durationMinutes) || 30

  const appointments = useAvailabilityAppointments(isDemo ? form.date : null, isDemo ? form.employeeId : null)

  useEffect(() => {
    if (isDemo) return
    let active = true
    setRemoteBranch(null)
    setRemoteServices([])
    setRemoteSpecialists([])
    setRemoteSlots(null)
    setContextError('')
    if (!branchId) {
      setContextError('El enlace no contiene una sucursal. Solicita un nuevo enlace al establecimiento.')
      return
    }
    publicBookingApi.getContext(branchId)
      .then((context) => {
        if (!active) return
        setRemoteBranch({ id: context.branch.branchId, name: context.branch.branchName, timezone: context.branch.timezone })
        setForm((current) => ({ ...current, date: branchDateKey(context.branch.timezone), time: '' }))
        setHasResources(context.hasResources !== false)
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
        setWorkspaceBranches(
          (context.workspaceBranches || []).map((item) => ({
            id: item.id,
            name: item.name,
          }))
        )
      })
      .catch(() => {
        if (active) setContextError('No se pudo cargar la sucursal. Intenta nuevamente o solicita un nuevo enlace.')
      })
    return () => { active = false }
  }, [branchId, isDemo])

  useEffect(() => {
    if (isDemo) {
      setWorkspaceBranches(branches.filter((b) => b.id).map((b) => ({ id: b.id, name: b.name })))
    }
  }, [branches, isDemo])

  useEffect(() => {
    const session = recallPublicSession()
    if (!branchId || !session?.documentId || session.branchId !== branchId) return
    if (intentBook) {
      if (phase === 'branch') {
        setPhase('booking')
        setStep(2)
      }
      return
    }
    if (phase === 'branch' && !explicitBranchPick) {
      navigate(`/agendar/portal?branch=${branchId}`, { replace: true })
    }
  }, [branchId, intentBook, navigate, phase, explicitBranchPick])

  useEffect(() => {
    let active = true
    setRemoteSlots(null)
    setSlotError('')
    if (isDemo || !branch?.id || !form.employeeId || !form.date || !form.serviceId) {
      setSlotLoading(false)
      return
    }
    setSlotLoading(true)
    fetchRemoteSlots({
      branchId: branch.id,
      date: form.date,
      employeeId: form.employeeId,
      serviceId: form.serviceId,
    })
      .then((slots) => { if (active) setRemoteSlots(slots) })
      .catch((error) => { if (active) setSlotError(error.message || 'No se pudieron consultar los horarios.') })
      .finally(() => { if (active) setSlotLoading(false) })
    return () => { active = false }
  }, [branch?.id, fetchRemoteSlots, form.date, form.employeeId, form.serviceId, isDemo, slotRevision])

  const set = (k, v) => {
    const changesAvailability = ['serviceId', 'employeeId', 'date'].includes(k)
    if (changesAvailability) setRemoteSlots(null)
    setForm((f) => ({ ...f, [k]: v, ...(changesAvailability ? { time: '' } : {}) }))
  }

  useEffect(() => {
    if (!form.employeeId) return
    if (!bookableStaff.some((member) => member.id === form.employeeId)) {
      set('employeeId', bookableStaff[0]?.id || '')
    }
  }, [bookableStaff, form.employeeId])

  const slots = useMemo(() => {
    if (!form.employeeId || !form.date) return []
    if (!isDemo) return remoteSlots || []
    return getAvailableSlots({
      date: form.date,
      employeeId: form.employeeId,
      duration: appointmentDuration,
      appointments,
      employee: selectedEmployee,
      vacationRequests,
    })
  }, [form.employeeId, form.date, appointments, selectedEmployee, vacationRequests, appointmentDuration, isDemo, remoteSlots])

  const applyProfileToForm = (found, docType) => {
    setForm((current) => applyBranchBookingDefaults({
      ...current,
      docType: found.docType || docType,
      documentId: formatDocumentInput(found.documentId, found.docType || docType),
      name: found.name,
      email: found.email,
      phone: found.phone,
      address: found.address || '',
      wantsInvoice: found.wantsInvoice,
      wantsContact: found.wantsContact,
      observaciones: found.observaciones || '',
    }, {
      serviceId: found.lastServiceId,
      employeeId: found.lastEmployeeId,
    }, { services, bookableStaff }))
  }

  useEffect(() => {
    if (!intentBook || isDemo || !branchId || restoredSessionDefaultsRef.current) return
    if (!remoteServices?.length || !bookableStaff.length) return
    const session = recallPublicSession()
    if (!session?.documentId || session.branchId !== branchId) return
    if (phase !== 'booking' || step !== 2) return
    restoredSessionDefaultsRef.current = true
    identifyRemote(branchId, session.docType || 'cedula', session.documentId)
      .then((found) => {
        if (!found) return
        applyProfileToForm(found, found.docType || session.docType || 'cedula')
      })
      .catch(() => {})
  }, [branchId, identifyRemote, intentBook, isDemo, phase, step])

  const finishAuth = (profile, goBook) => {
    const activeBranch = branch?.id || branchId
    rememberPublicSession({
      branchId: activeBranch,
      docType: profile.docType,
      documentId: profile.documentId,
    })
    rememberDocument(profile.documentId)
    if (goBook) {
      setPhase('booking')
      setStep(2)
      return
    }
    navigate(`/agendar/portal?branch=${activeBranch}`)
  }

  const lookupDoc = async () => {
    const key = normalizeDocumentId(lookup, lookupDocType)
    if (lookupDocType === 'cedula' && key.length !== 11) {
      return toast.error('Ingresa una cédula válida (11 dígitos)')
    }
    if (lookupDocType === 'pasaporte' && key.length < 5) {
      return toast.error('Ingresa un documento válido')
    }
    let found
    try {
      found = isDemo
        ? lookupByDocument(key, lookupDocType)
        : await identifyRemote(branch?.id || branchId, lookupDocType, key)
    } catch (error) {
      return toast.error(error.message || 'No se pudo consultar el documento. Intenta nuevamente.')
    }
    if (found) {
      if (isDemo) {
        const defaults = await fetchLastVisitBookingDefaults(found.customerId)
        found = {
          ...found,
          lastServiceId: defaults.serviceId,
          lastEmployeeId: defaults.employeeId,
        }
      }
      applyProfileToForm(found, lookupDocType)
      toast.success(`Bienvenido de nuevo, ${found.name}`)
      finishAuth({ ...found, docType: found.docType || lookupDocType }, intentBook)
      return
    }
    setForm((f) => ({
      ...f,
      docType: lookupDocType,
      documentId: formatDocumentInput(key, lookupDocType),
    }))
    setShowRegister(true)
    toast.message('No encontramos tu documento — completa el registro')
  }

  const saveProfile = async () => {
    if (!form.name.trim()) return toast.error('Ingresa tu nombre')
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return toast.error('Ingresa un correo válido')
    const docKey = normalizeDocumentId(form.documentId, form.docType)
    if (!docKey) return toast.error('Ingresa tu documento')
    if (form.docType === 'cedula' && docKey.length !== 11) {
      return toast.error('La cédula debe tener 11 dígitos')
    }
    if (form.wantsInvoice && !form.email.trim()) return toast.error('El email es requerido para factura')
    if (form.wantsContact && !form.phone.trim()) return toast.error('El teléfono es requerido para contacto')
    const profile = { ...form, documentId: docKey }
    if (!isDemo) {
      try {
        await publicPortalApi.register(branch?.id || branchId, {
          documentType: profile.docType,
          documentId: docKey,
          displayName: profile.name.trim(),
          email: profile.email.trim() || null,
          phone: profile.phone.trim() || null,
          address: profile.address.trim() || null,
          wantsInvoice: profile.wantsInvoice,
          wantsContact: profile.wantsContact,
          observaciones: profile.observaciones.trim() || null,
        })
      } catch (error) {
        return toast.error(error.message || 'No se pudo completar el registro')
      }
    }
    upsertProfile(profile)
    toast.success('Registro completado')
    finishAuth({ ...profile, docType: profile.docType }, intentBook)
  }

  const confirmBranch = () => {
    if (!branchId) return toast.error('Selecciona una sucursal')
    setExplicitBranchPick(false)
    setPhase('identity')
  }

  const openBranchPicker = () => {
    clearBookIntent()
    setShowRegister(false)
    setExplicitBranchPick(true)
    setPhase('branch')
  }

  const switchBranch = (nextBranchId) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('branch', nextBranchId)
      return next
    })
  }

  const timeSlotsForPicker = useMemo(() => {
    if (!form.employeeId || !form.date) return []
    if (slotLoading) return []
    return slots
  }, [form.date, form.employeeId, slotLoading, slots])

  const continueToConfirm = () => {
    if (!form.serviceId) return toast.error('Selecciona un servicio')
    if (!form.employeeId) return toast.error('Selecciona un especialista')
    if (!form.time) return toast.error('Selecciona una hora')
    if (!isDemo && (slotLoading || !remoteSlots?.includes(form.time))) {
      return toast.error('Ese horario ya no está disponible. Elige otro cupo.')
    }
    setStep(3)
  }

  const confirm = async () => {
    if (savingRef.current) return
    if (!service || !form.time || !form.employeeId) return toast.error('Completa la cita')
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
    if (!isDemo && (slotLoading || !remoteSlots?.includes(form.time))) {
      return toast.error('Ese horario ya no está disponible. Elige otro cupo.')
    }
    const profile = upsertProfile(form)
    const fingerprint = JSON.stringify({ branchId: branch.id, serviceId: service.id, ...form })
    if (attemptRef.current?.fingerprint !== fingerprint) attemptRef.current = { fingerprint, key: crypto.randomUUID() }
    savingRef.current = true
    setSaving(true)
    try {
      const appointment = await bookAppointment({
        profile,
        branchId: branch.id,
        service,
        date: form.date,
        time: form.time,
        employeeId: form.employeeId,
        idempotencyKey: attemptRef.current.key,
      })
      setSavedAppointment(appointment)
      rememberDocument(profile.documentId)
      setDone(true)
      toast.success('¡Cita agendada!')
    } catch (error) {
      toast.error(error.message || 'No se pudo agendar la cita')
      if (error.status === 409) {
        set('time', '')
        setStep(2)
        setSlotRevision((v) => v + 1)
      }
    } finally { savingRef.current = false; setSaving(false) }
  }

  const clearBookIntent = () => {
    if (!params.get('intent')) return
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('intent')
      return next
    })
  }

  const goBack = () => {
    if (phase === 'booking' && step <= 2) {
      clearBookIntent()
      setPhase('identity')
      setStep(0)
      return
    }
    setStep((current) => Math.max(0, current - 1))
  }

  if (!isDemo && (!branch || contextError)) {
    return (
      <PublicShell>
        <p role={contextError ? 'alert' : 'status'} className="mx-auto max-w-lg text-center text-slate-600">
          {contextError || 'Cargando sucursal…'}
        </p>
      </PublicShell>
    )
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
          <p className="mt-4 text-sm text-slate-500">
            {isDemo ? 'Modo demo: no se enviaron correos reales.' : emailResultMessage(savedAppointment?.notification)}
          </p>
          <Link
            to={isDemo ? `/agendar/portal?branch=${branch.id}&doc=${normalizeDocumentId(form.documentId, form.docType)}` : `/agendar/portal?branch=${branch.id}`}
            className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Ir a mi portal
          </Link>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell branchName={branch?.name}>
      <div className="mx-auto max-w-lg">
        {phase === 'booking' && <Stepper current={Math.max(0, step - 2)} />}

        {phase === 'branch' && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Elige tu sucursal</h2>
            <p className="text-sm text-slate-500">Confirma dónde deseas atenderte. Puedes cambiarla si visitas otra ubicación del comercio.</p>
            <ul className="space-y-2">
              {(workspaceBranches.length ? workspaceBranches : [{ id: branchId, name: branch?.name || 'Sucursal' }]).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => switchBranch(item.id)}
                    className={cn(
                      'w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition',
                      item.id === branchId
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-700 hover:border-slate-400'
                    )}
                    data-testid={`branch-option-${item.id}`}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
            <Button className="w-full" onClick={confirmBranch} data-testid="branch-confirm">
              Continuar <ChevronRight className="h-4 w-4" />
            </Button>
          </section>
        )}

        {phase === 'identity' && (
          <section className="space-y-4">
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
              <h2 className="font-heading text-xl font-bold text-slate-900">
                {showRegister ? 'Completa tu registro' : 'Ingresa tu documento'}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Tipo de documento *</label>
                  <Select
                    value={showRegister ? form.docType : lookupDocType}
                    onChange={(v) => {
                      if (showRegister) {
                        set('docType', v)
                        set('documentId', formatDocumentInput(form.documentId, v))
                      } else {
                        setLookupDocType(v)
                        setLookup(formatDocumentInput(lookup, v))
                      }
                    }}
                    options={DOC_TYPES.map((d) => ({ value: d.id, label: d.label }))}
                    data-testid="self-doc-type"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Documento *</label>
                  <Input
                    value={showRegister ? form.documentId : lookup}
                    onChange={(e) => {
                      const value = formatDocumentInput(e.target.value, showRegister ? form.docType : lookupDocType)
                      if (showRegister) set('documentId', value)
                      else setLookup(value)
                    }}
                    placeholder="Ej: 402-1465948-5"
                    data-testid="self-doc-lookup"
                  />
                </div>
              </div>

              {showRegister && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Nombre *</label>
                    <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Juan Pérez" data-testid="self-name" />
                  </div>
                  <OptionalPreferenceCards
                    wantsInvoice={form.wantsInvoice}
                    wantsContact={form.wantsContact}
                    onToggleInvoice={() => set('wantsInvoice', !form.wantsInvoice)}
                    onToggleContact={() => set('wantsContact', !form.wantsContact)}
                    email={form.email}
                    onEmailChange={(v) => set('email', v)}
                    phone={form.phone}
                    onPhoneChange={(v) => set('phone', v)}
                  />
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                      <MapPin className="h-3.5 w-3.5" /> Dirección (opcional)
                    </label>
                    <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Ej: Calle Principal #123, Santo Domingo" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Observaciones (opcional)</label>
                    <textarea
                      value={form.observaciones}
                      onChange={(e) => set('observaciones', e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Comentarios para el comercio"
                    />
                  </div>
                  <Button className="w-full" onClick={saveProfile} data-testid="self-save-profile">
                    Crear cuenta <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}

              {!showRegister && (
                <>
                  <p className="text-center text-xs text-slate-500">
                    ¿Primera vez?{' '}
                    <button
                      type="button"
                      className="font-semibold text-blue-600"
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          docType: lookupDocType,
                          documentId: formatDocumentInput(lookup, lookupDocType),
                        }))
                        setShowRegister(true)
                      }}
                    >
                      Regístrate aquí
                    </button>
                  </p>
                  <Button className="w-full" onClick={lookupDoc} data-testid="self-login-search">
                    Ingresar
                  </Button>
                </>
              )}

              <Button variant="secondary" className="w-full" onClick={openBranchPicker} data-testid="self-change-branch">
                <ChevronLeft className="h-4 w-4" /> Cambiar sucursal
              </Button>
            </div>
          </section>
        )}

        {phase === 'booking' && step === 2 && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Elige tu cita</h2>
            <p className="text-xs text-slate-500">Los horarios se actualizan según el horario del especialista y las citas ya reservadas. {branch?.timezone && `Hora del establecimiento (${branch.timezone}).`}</p>
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
            {!bookableStaff.length && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="self-no-specialists">Esta sucursal todavía no tiene especialistas habilitados para agendar en línea. Contacta al establecimiento.</p>}
            {!services.length && <p role="status">Esta sucursal no tiene servicios disponibles.</p>}
            {!isDemo && !hasResources && <p role="status">La sucursal todavía no tiene cabinas disponibles para recibir reservas.</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-600">Fecha</label>
                <DatePicker
                  value={form.date}
                  onChange={(date) => {
                    set('date', date)
                    set('time', '')
                  }}
                  minDate={branchDateKey(branch?.timezone)}
                  testId="self-booking-date"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-600">Hora</label>
                {slotError ? (
                  <div role="alert" className="space-y-2">
                    <p className="text-sm text-red-600">{slotError}</p>
                    <Button onClick={() => setSlotRevision((v) => v + 1)} data-testid="self-slots-retry">Reintentar</Button>
                  </div>
                ) : (
                  <TimePicker
                    value={form.time}
                    onChange={(time) => set('time', time)}
                    slots={timeSlotsForPicker}
                    emptyMessage={
                      slotLoading
                        ? 'Consultando horarios…'
                        : !form.employeeId
                          ? 'Selecciona un especialista.'
                          : 'No hay cupos según el horario del especialista.'
                    }
                    testId="self-booking-time"
                  />
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-600">Duración</p>
                <p
                  className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700"
                  data-testid="self-duration-display"
                >
                  {service ? durationLabel(appointmentDuration) : 'Selecciona un servicio'}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-600">Especialista</label>
                <Select
                  value={form.employeeId}
                  onChange={(v) => {
                    set('employeeId', v)
                    set('time', '')
                  }}
                  data-testid="self-specialist"
                  placeholder="Seleccionar especialista"
                  options={bookableStaff.map((e) => ({ value: e.id, label: e.name.split(' ').slice(0, 2).join(' ') }))}
                />
              </div>
            </div>
            <Button className="w-full" onClick={continueToConfirm} disabled={!form.time || !form.employeeId} data-testid="self-booking-continue">
              Continuar <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="secondary" className="w-full" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" /> Atrás
            </Button>
          </section>
        )}

        {phase === 'booking' && step === 3 && service && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="font-heading text-xl font-bold text-slate-900">Confirmar</h2>
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <p><span className="text-slate-400">Cliente:</span> <strong>{form.name}</strong></p>
              <p><span className="text-slate-400">Documento:</span> {formatDocumentDisplay(form.documentId, form.docType)}</p>
              <p><span className="text-slate-400">Servicio:</span> {service.name} · {formatDOP(service.price)}</p>
              <p className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-500" />
                <span className="capitalize">{formatLongDate(form.date)}</span>
                {' · '}
                {formatTime12h(form.time)} – {formatTime12h(endTime(form.time, appointmentDuration))}
              </p>
              <p><span className="text-slate-400">Sucursal:</span> {branch?.name}</p>
            </div>
            <Button className="w-full" onClick={confirm} disabled={saving || (!isDemo && (slotLoading || !remoteSlots?.includes(form.time)))} data-testid="self-confirm">
              {saving ? 'Guardando cita…' : 'Confirmar cita'}
            </Button>
            <button type="button" disabled={saving} data-testid="self-change-time" onClick={() => setStep(2)} className="w-full text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50">
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

