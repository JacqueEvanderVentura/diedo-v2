import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { carwashApi } from '../api'

export function WashActionModal({ wash, action, writable, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef(false)
  const attempt = useRef(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const voiding = action === 'void'
  const cancel = action === 'cancel' || voiding
  async function submit(event) {
    event.preventDefault()
    if (!writable || pending.current) return
    if (cancel && reason.trim().length < 3) { setError(new Error('Indica un motivo de al menos tres caracteres.')); return }
    if (!attempt.current) attempt.current = { key: crypto.randomUUID(), payload: { version: wash.version, ...(cancel ? { reason: reason.trim() } : {}) } }
    pending.current = true; setBusy(true); setError(null)
    try {
      await carwashApi.washAction(wash.id, action, attempt.current.payload, attempt.current.key)
      if (mounted.current) onSaved()
    } catch (failure) {
      if (!mounted.current) return
      setError(failure)
      const ambiguous = !failure.status || failure.status >= 500
      setUncertain(ambiguous)
      if (!ambiguous) attempt.current = null
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <Modal open title={voiding ? 'Anular lavado y factura' : cancel ? 'Cancelar lavado' : 'Iniciar lavado'} testId="carwash-action-modal" onClose={() => { if (!pending.current && !uncertain) onClose() }}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600"><strong>{wash.plate}</strong> · {wash.customerName}</p>
      <p className="text-sm text-slate-600">{voiding ? 'Se anularán la factura, su cobro o deuda pendiente y las comisiones. Los cobros aplicados a CxC y las liquidaciones deben revertirse primero.' : cancel ? 'El registro y su historial se conservarán.' : 'El vehículo pasará de En espera a Lavando.'}</p>
      {cancel && <label className="block text-sm font-medium">{voiding ? 'Motivo de anulación' : 'Motivo de cancelación'}<Input className="mt-2" value={reason} minLength={3} maxLength={voiding ? 1000 : 500} required disabled={busy || uncertain} onChange={(event) => setReason(event.target.value)} /></label>}
      {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
      {uncertain && <p className="text-sm text-amber-800">No se confirmó el resultado. Reintenta para recuperar la respuesta sin repetir la acción.</p>}
      {!writable && <p className="text-sm text-amber-800">Solo lectura hasta recuperar la conexión.</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy || uncertain} onClick={error?.status === 409 ? onSaved : onClose}>{error?.status === 409 ? 'Cerrar y actualizar' : 'Volver'}</Button><Button type="submit" disabled={busy || !writable || error?.status === 409}>{busy ? 'Guardando…' : uncertain ? 'Reintentar acción' : voiding ? 'Confirmar anulación' : cancel ? 'Confirmar cancelación' : 'Iniciar lavado'}</Button></div>
    </form>
  </Modal>
}
