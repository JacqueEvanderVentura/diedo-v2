import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { PaymentMethodPicker } from '@/modules/pos/components/PaymentMethodPicker'
import { PaymentEvidenceFields } from '@/modules/pos/components/PaymentEvidenceFields'
import { posApi } from '@/services/posApi'
import { carwashApi } from '../api'

export function WashCheckoutModal({ wash, writable, money, onClose, onSaved }) {
  const [context, setContext] = useState(null)
  const [revision, setRevision] = useState(0)
  const [methodId, setMethodId] = useState(wash.paymentMethodId || '')
  const [reference, setReference] = useState('')
  const [proof, setProof] = useState(null)
  const [discountType, setDiscountType] = useState('percent')
  const [discountValue, setDiscountValue] = useState('0')
  const [prices, setPrices] = useState({})
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [completed, setCompleted] = useState(null)
  const [proofDone, setProofDone] = useState(false)
  const pending = useRef(false)
  const attempt = useRef(null)
  const mounted = useRef(true)
  const latest = context?.wash || wash
  const pricing = JSON.stringify({ version: latest.version, ...(Number(discountValue) > 0 ? { discountType, discountValue } : {}), priceOverrides: Object.entries(prices).filter(([, value]) => value !== '').map(([washLineId, unitPrice]) => ({ washLineId, unitPrice })) })
  const methods = (context?.paymentMethods || []).map((method) => ({ ...method, enabled: true, requiresProof: method.requiresEvidence && context.canUploadProof && method.settlementPolicy !== 'immediate' }))
  const method = methods.find((item) => item.id === methodId)
  const previewReady = preview?.key === pricing
  const frozen = busy || uncertain || !!completed || !writable
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true
    setContext(null); setError(null)
    carwashApi.checkoutContext(wash.id).then((result) => {
      if (!active) return
      setContext(result)
      setMethodId((current) => result.paymentMethods.some((item) => item.id === current) ? current : result.paymentMethods[0]?.id || '')
    }).catch((failure) => { if (active) setError(failure) })
    return () => { active = false }
  }, [wash.id, revision])
  useEffect(() => {
    if (!context || completed || uncertain) return
    let active = true
    setPreviewError(null)
    const timer = setTimeout(() => {
      carwashApi.previewWash(wash.id, JSON.parse(pricing)).then((result) => {
        if (active) setPreview({ ...result, key: pricing })
      }).catch((failure) => { if (active) { setPreview(null); setPreviewError(failure) } })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [wash.id, context, pricing, completed, uncertain])
  async function upload(result) {
    if (!proof || !result.receivableId || !context.canUploadProof || result.status === 'voided') return
    await posApi.uploadReceivableProof(result.receivableId, { file: proof })
    if (mounted.current) setProofDone(true)
  }
  async function submit(event) {
    event.preventDefault()
    if (pending.current || !writable || (!uncertain && !completed && (!previewReady || !context?.registerId || !method))) return
    pending.current = true; setBusy(true); setError(null)
    let result = completed
    try {
      if (!result) {
        if (!attempt.current) attempt.current = { key: crypto.randomUUID(), payload: { ...JSON.parse(pricing), registerId: context.registerId, paymentMethodId: methodId, reference: reference.trim() || null } }
        result = await carwashApi.washAction(wash.id, 'complete', attempt.current.payload, attempt.current.key)
        if (!mounted.current) return
        setCompleted(result); setUncertain(false)
      }
      await upload(result)
    } catch (failure) {
      if (!mounted.current) return
      setError(failure)
      if (!result) {
        const ambiguous = !failure.status || failure.status >= 500
        setUncertain(ambiguous)
        if (!ambiguous) attempt.current = null
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const close = () => { if (!pending.current && !uncertain) (completed || error?.status === 409 || previewError?.status === 409 ? onSaved : onClose)() }
  return <Modal open wide title={completed?.status === 'voided' ? 'Lavado anulado' : completed ? 'Lavado completado' : 'Completar y facturar lavado'} testId="carwash-checkout-modal" onClose={close} bodyClassName="!p-0 !overflow-hidden flex flex-col">
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 space-y-5 overflow-y-auto p-5">
        <p className="text-sm text-slate-600"><strong className="text-slate-900">{wash.plate}</strong> · {wash.customerName}</p>
        {!context && !error && <p role="status">Consultando caja y métodos de pago…</p>}
        {context && !completed && <>
          {!context.registerId && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>Necesitas una caja abierta en esta sucursal para completar el lavado.</p><a className="mt-2 inline-block font-semibold underline" href="/pos/caja" target="_blank" rel="noreferrer">Abrir Caja</a><Button type="button" variant="ghost" onClick={() => setRevision((value) => value + 1)}>Actualizar caja</Button></div>}
          <fieldset disabled={frozen} className="min-w-0 space-y-5">
            <div className="space-y-3"><h3 className="text-sm font-semibold">Servicios registrados</h3>{latest.lines.map((line) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{line.name}</p><p className="text-xs text-slate-500">Precio capturado: {money(line.unitPrice)} · Impuesto: {line.taxRate}%</p></div>{context.canDiscount && <label className="w-32 text-xs text-slate-600">Precio autorizado<Input aria-label={`Precio de ${line.name}`} type="number" min="0" step="0.01" value={prices[line.id] ?? line.unitPrice} onChange={(event) => setPrices((current) => ({ ...current, [line.id]: event.target.value }))} /></label>}</div>)}</div>
            {context.canDiscount && <div className="grid grid-cols-2 gap-3"><label className="text-sm">Descuento<Select aria-label="Tipo de descuento" value={discountType} onChange={setDiscountType} options={[{ value: 'percent', label: 'Porcentaje' }, { value: 'fixed', label: 'Importe fijo' }]} /></label><label className="text-sm">Valor del descuento<Input aria-label="Valor del descuento" type="number" min="0" max={discountType === 'percent' ? 100 : undefined} step="0.01" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /></label></div>}
            <PaymentMethodPicker methods={methods} value={methodId} onChange={(value) => { setMethodId(value); setProof(null) }} testIdPrefix="carwash-payment" gridClassName="grid-cols-2 min-[380px]:grid-cols-3" />
            {!methods.length && <p className="text-sm text-amber-800">No hay métodos de pago habilitados.</p>}
            <PaymentEvidenceFields method={method} reference={reference} onReferenceChange={setReference} proof={proof} onProofChange={setProof} testIdPrefix="carwash-evidence" />
          </fieldset>
          <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm" aria-live="polite">{previewReady ? <><p className="flex justify-between">Subtotal <span>{money(preview.subtotal)}</span></p><p className="flex justify-between">Descuento <span>−{money(preview.discountAmount)}</span></p><p className="flex justify-between">Impuestos <span>{money(preview.taxAmount)}</span></p><p className="flex justify-between border-t pt-2 text-base font-semibold">Total a facturar <span data-testid="carwash-checkout-total">{money(preview.total)}</span></p></> : <p>{previewError ? 'No se pudo calcular el total.' : 'Calculando total…'}</p>}</div>
          <p className="text-xs text-slate-500">Las comisiones se devengan al completar, incluso cuando el pago queda pendiente en CxC.</p>
        </>}
        {completed && <div className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">Factura {completed.saleNumber} · {money(completed.finalTotal)}</p><p>{completed.status === 'voided' ? 'Este lavado fue anulado después de facturarse. Se conserva la factura y su historial.' : completed.receivableId ? 'Cuenta por cobrar registrada. El pago está pendiente de confirmación.' : 'Venta registrada correctamente.'}</p><p>{completed.status === 'voided' ? 'Sus comisiones están anuladas.' : 'Las comisiones de ambos roles quedaron devengadas.'}</p>{proofDone && <p>Comprobante adjuntado.</p>}{error && <p>La venta ya está guardada. Reintentar solo enviará el comprobante.</p>}</div>}
        {(error || previewError) && <p role="alert" className="text-sm text-red-700">{(error || previewError).message}</p>}
        {uncertain && <p className="text-sm text-amber-800">No se confirmó la respuesta. Reintenta con los mismos datos para recuperar la venta sin duplicarla.</p>}
        {!writable && <p className="text-sm text-amber-800">Solo lectura hasta recuperar la conexión.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-white p-4">
        {!completed && previewReady && <p className="flex w-full justify-between text-sm font-semibold text-slate-800 sm:hidden">Total a facturar <span>{money(preview.total)}</span></p>}
        <Button type="button" variant="secondary" disabled={busy || uncertain} onClick={close}>{completed ? 'Cerrar y actualizar' : 'Volver'}</Button>
        {!context && error && <Button type="button" onClick={() => setRevision((value) => value + 1)}>Reintentar consulta</Button>}
        {completed ? error && proof && completed.receivableId && <Button type="submit" disabled={busy || !writable}>Reintentar comprobante</Button> : <Button type="submit" data-testid="carwash-confirm-checkout" disabled={busy || !writable || (!uncertain && (!previewReady || !context?.registerId || !method || error?.status === 409))}>{busy ? 'Guardando…' : uncertain ? 'Recuperar resultado' : 'Completar y facturar'}</Button>}
      </div>
    </form>
  </Modal>
}
