import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { carwashApi } from '../api'

export function commissionTotal(rows) {
  const cents = rows.reduce((sum, row) => sum + BigInt(row.amount.replace('.', '')), 0n)
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}

export function SettlementModal({ branchId, rows = [], settlement, writable, money, onClose, onSaved }) {
  const [context, setContext] = useState(null)
  const [methodId, setMethodId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [revision, setRevision] = useState(0)
  const pending = useRef(false)
  const attempt = useRef(null)
  const mounted = useRef(true)
  const reversing = !!settlement
  const entries = settlement?.commissions || rows
  const amount = settlement?.amount || commissionTotal(rows)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true
    setContext(null)
    carwashApi.commissionContext(branchId).then((result) => { if (active) { setContext(result); setMethodId(result.paymentMethods[0]?.id || ''); setError(null) } }).catch((failure) => { if (active) setError(failure) })
    return () => { active = false }
  }, [branchId, revision])
  const capable = reversing ? context?.canReverse : context?.canSettle
  const canSubmit = writable && capable && context?.registerId && (reversing ? reason.trim().length >= 3 : methodId) && !busy && !conflict
  async function submit(event) {
    event.preventDefault()
    if (!canSubmit || pending.current) return
    if (!attempt.current) attempt.current = { key: crypto.randomUUID(), payload: reversing ? { version: settlement.version, reason: reason.trim() } : { branchId, employeeId: rows[0].employeeId, registerId: context.registerId, paymentMethodId: methodId, commissions: rows.map((row) => ({ id: row.id, version: row.version })) } }
    pending.current = true; setBusy(true); setError(null)
    try {
      if (reversing) await carwashApi.reverseSettlement(settlement.id, attempt.current.payload, attempt.current.key)
      else await carwashApi.settleCommissions(attempt.current.payload, attempt.current.key)
      if (mounted.current) onSaved()
    } catch (failure) {
      if (!mounted.current) return
      setError(failure)
      const ambiguous = !failure.status || failure.status >= 500
      setUncertain(ambiguous)
      setConflict([403, 404, 409].includes(failure.status))
      if (!ambiguous) attempt.current = null
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <Modal open title={reversing ? 'Revertir liquidación' : 'Liquidar comisiones'} testId="carwash-settlement-modal" bodyClassName="!overflow-hidden" onClose={() => { if (!pending.current && !uncertain) (conflict ? onSaved : onClose)() }}>
    <form onSubmit={submit} className="flex max-h-[70dvh] flex-col gap-4">
      <div data-testid="carwash-settlement-fields" className="min-h-0 space-y-4 overflow-y-auto pr-1">
        <p className="text-sm text-slate-600"><strong>{settlement?.employeeName || rows[0]?.employeeName}</strong> · {entries.length} comisiones</p>
        <p className="text-sm text-slate-600">{reversing ? 'Las comisiones volverán a pendientes y el efectivo regresará a la caja abierta de esta sucursal. Se conservará el historial.' : 'Se registrará un único egreso en la caja abierta de esta sucursal. Los importes se validan nuevamente al confirmar.'}</p>
        <ul className="space-y-2 text-sm">{entries.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3"><span>{row.service} · {row.role === 'washer' ? 'Lavador' : 'Encargado'}<span className="block text-xs text-slate-500">{row.plate} · {row.saleNumber}</span></span><strong>{money(row.amount)}</strong></li>)}</ul>
        {context && !context.registerId && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Necesitas una caja abierta en esta sucursal. <a className="font-medium underline" href="/pos/caja" target="_blank" rel="noreferrer">Abrir Caja</a></div>}
        {context?.registerId && <p className="text-xs text-slate-500">Caja: <span className="break-all">{context.registerId}</span></p>}
        <fieldset disabled={busy || uncertain || conflict || !writable} className="space-y-3">
          {reversing ? <label className="block text-sm font-medium">Motivo del reverso<Input className="mt-2" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label> : <label className="block text-sm font-medium">Método de efectivo<Select className="mt-2" value={methodId} options={(context?.paymentMethods || []).map((item) => ({ value: item.id, label: item.name }))} onChange={setMethodId} placeholder="Seleccionar método" /></label>}
          {!context?.registerId && <Button type="button" variant="secondary" onClick={() => setRevision((value) => value + 1)}>Actualizar caja</Button>}
        </fieldset>
        {amount === '0.00' && <p className="text-sm text-slate-500">Importe cero: no se creará un movimiento monetario.</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
        {uncertain && <p className="text-sm text-amber-800">No se confirmó la respuesta. Recupera el resultado con la misma solicitud para evitar un pago duplicado.</p>}
        {!writable && <p className="text-sm text-amber-800">Solo lectura hasta recuperar la conexión.</p>}
      </div>
      <div className="shrink-0 space-y-3 border-t border-slate-200 pt-4">
        <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-semibold"><span>{reversing ? 'Efectivo a reintegrar' : 'Total a liquidar'}</span><span data-testid="carwash-settlement-total">{money(amount)}</span></p>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy || uncertain} onClick={conflict ? onSaved : onClose}>{conflict ? 'Actualizar selección' : 'Cancelar'}</Button><Button type="submit" disabled={!canSubmit} data-testid="carwash-confirm-settlement">{busy ? 'Procesando…' : uncertain ? 'Recuperar resultado' : reversing ? 'Confirmar reverso' : 'Confirmar liquidación'}</Button></div>
      </div>
    </form>
  </Modal>
}
