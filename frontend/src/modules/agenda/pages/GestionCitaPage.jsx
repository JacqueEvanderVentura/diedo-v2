import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicBookingApi } from '@/services/publicBookingApi'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { DURATION_OPTIONS } from '@/data/agenda'
import { branchDateKey, emailResultMessage } from '../lib/notification'

export default function GestionCitaPage({ branchId, appointmentId, token }) {
  const [appointment, setAppointment] = useState(null)
  const [error, setError] = useState('')
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState(30)
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotError, setSlotError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [revision, setRevision] = useState(0)
  const [cancelPrompt, setCancelPrompt] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    setAppointment(null)
    setError('')
    if (!branchId || !appointmentId || !token) {
      setError('El enlace está incompleto. Abre el enlace de gestión incluido en tu confirmación.')
      return
    }
    publicBookingApi.getAppointment(branchId, appointmentId, token).then((result) => {
      if (!active) return
      setAppointment(result)
      setDate(result.date)
      setDuration(result.durationMinutes)
    }).catch((err) => { if (active) setError(err.message || 'El enlace no es válido o la cita ya no existe.') })
    return () => { active = false }
  }, [branchId, appointmentId, token])

  useEffect(() => {
    let active = true
    setTime('')
    setSlots([])
    setSlotError('')
    if (!appointment || appointment.status !== 'confirmed' || !date) {
      setLoadingSlots(false)
      return
    }
    setLoadingSlots(true)
    publicBookingApi.managementSlots(branchId, appointmentId, { token, date, duration }).then((result) => {
      if (active) setSlots(result.slots)
    }).catch((err) => { if (active) setSlotError(err.message || 'No se pudieron consultar los horarios.') })
      .finally(() => { if (active) setLoadingSlots(false) })
    return () => { active = false }
  }, [branchId, appointmentId, token, date, duration, appointment, revision])

  const mutate = async (action) => {
    if (busyRef.current) return
    if (action === 'reschedule' && (!time || loadingSlots || !slots.includes(time))) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const payload = { managementToken: token }
      const updated = action === 'cancel'
        ? await publicBookingApi.cancelAppointment(branchId, appointmentId, payload)
        : await publicBookingApi.rescheduleAppointment(branchId, appointmentId, { ...payload, date, time, duration })
      setAppointment((current) => ({ ...current, ...updated }))
      setCancelPrompt(false)
      setNotice(`${action === 'cancel' ? 'Cita cancelada.' : 'Cita reagendada.'} ${emailResultMessage(updated.notification)}`)
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la cita. Intenta nuevamente.')
      setRevision((value) => value + 1)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10" data-testid="appointment-management">
      <section className="mx-auto max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-slate-900">Gestionar mi cita</h1>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {!appointment && !error && <p role="status">Cargando cita…</p>}
        {appointment && <>
          <div className="space-y-1 text-slate-700">
            <p className="font-semibold">{appointment.workspaceName} · {appointment.branchName}</p>
            <p>{appointment.serviceName}</p>
            <p data-testid="managed-appointment-time">{appointment.date} · {appointment.time} · {appointment.durationMinutes} minutos</p>
            <p className="text-sm">Hora del establecimiento ({appointment.timezone})</p>
            <p data-testid="managed-appointment-status">{appointment.status === 'cancelled' ? 'Cancelada' : appointment.status === 'confirmed' ? 'Confirmada' : 'Cita cerrada'}</p>
          </div>
          {notice && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
          {appointment.status === 'confirmed' && <>
            <h2 className="font-semibold">Elegir otro horario</h2>
            <DatePicker value={date} minDate={branchDateKey(appointment.timezone)} onChange={(value) => { setTime(''); setDate(value) }} testId="manage-date" />
            <Select value={duration} onChange={(value) => { setTime(''); setDuration(Number(value)) }} options={DURATION_OPTIONS} data-testid="manage-duration" />
            {loadingSlots ? <p role="status">Consultando horarios…</p> : slotError ? <div role="alert"><p>{slotError}</p><Button data-testid="manage-retry-slots" onClick={() => setRevision((value) => value + 1)}>Reintentar</Button></div>
              : slots.length ? <Select value={time} onChange={setTime} options={slots.map((slot) => ({ value: slot, label: slot }))} placeholder="Selecciona un horario" data-testid="manage-time" />
                : <p>No hay cupos disponibles para esta fecha y duración.</p>}
            <Button disabled={busy || loadingSlots || !time} onClick={() => mutate('reschedule')} data-testid="manage-reschedule">{busy ? 'Guardando…' : 'Reagendar cita'}</Button>
            {cancelPrompt ? <div className="space-y-2 rounded-lg bg-rose-50 p-3">
              <p>¿Cancelar esta cita y liberar el horario?</p>
              <div className="flex gap-2"><Button disabled={busy} onClick={() => mutate('cancel')} data-testid="manage-confirm-cancel">Sí, cancelar cita</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setCancelPrompt(false)} data-testid="manage-keep">Conservar cita</Button></div>
            </div> : <Button variant="secondary" disabled={busy} onClick={() => setCancelPrompt(true)} data-testid="manage-cancel">Cancelar cita</Button>}
          </>}
          <Link className="block text-sm text-blue-700 underline" to={`/agendar?branch=${encodeURIComponent(branchId)}`}>Agendar una nueva cita</Link>
        </>}
      </section>
    </main>
  )
}
