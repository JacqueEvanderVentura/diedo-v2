import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { POS_PROOF_ACCEPT } from '@/modules/pos/lib/receivables'
import { posApi } from '@/services/posApi'
import { carwashApi } from '../api'

export function WashBilling({ wash, money, writable }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [revision, setRevision] = useState(0)
  const [proof, setProof] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    let active = true
    setError(null)
    carwashApi.billing(wash.id).then((result) => { if (active) setData(result) }).catch((failure) => { if (active) { setData(null); setError(failure) } })
    return () => { active = false }
  }, [wash.id, revision])
  async function upload() {
    if (!proof || busy || !writable) return
    setBusy(true); setError(null)
    try { await posApi.uploadReceivableProof(data.receivableId, { file: proof }); setSent(true); setProof(null) }
    catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  return <div className="space-y-3 rounded-xl border border-slate-200 p-4">
    <h3 className="font-semibold">Factura {wash.saleNumber}</h3>
    {data && <><p>Subtotal: {money(data.subtotal)} · Descuento: {money(data.discountAmount)} · Impuestos: {money(data.taxAmount)}</p><p className="font-semibold">Total facturado: {money(data.total)} · {data.paymentMethodName}</p><p>{data.status === 'voided' ? 'Factura anulada' : `Pagado: ${money(data.paidAmount)} · Pendiente: ${money(data.pendingAmount)}`}</p>{data.receivableId && <a href="/pos/cuentas-por-cobrar" target="_blank" rel="noreferrer" className="block font-medium text-blue-700 underline">Consultar cuenta por cobrar</a>}{data.receivableId && data.canUploadProof && <fieldset disabled={busy || !writable} className="space-y-3"><label className="block text-sm">Comprobante<input className="mt-2 block max-w-full text-xs" type="file" accept={POS_PROOF_ACCEPT} onChange={(event) => { setProof(event.target.files?.[0] || null); setSent(false) }} /></label><Button type="button" disabled={!proof || busy || !writable} onClick={upload}>Adjuntar comprobante</Button></fieldset>}</>}
    {sent && <p className="text-emerald-700">Comprobante adjuntado a la cuenta por cobrar.</p>}
    {error && <p role="alert" className="text-red-700">{error.message}</p>}
    <Button type="button" size="sm" variant="ghost" disabled={busy || !writable} onClick={() => setRevision((value) => value + 1)}>Actualizar facturación</Button>
  </div>
}
