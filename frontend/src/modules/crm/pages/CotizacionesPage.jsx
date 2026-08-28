import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { QUOTE_STATUSES, QUOTE_STATUS_META } from '@/data/crm'
import { fmtDate } from '../lib/crm'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ExportMenu } from '@/modules/finanzas/components/ExportMenu'

export default function CotizacionesPage() {
  const quotes = useCrmStore((s) => s.quotes)
  const opportunities = useCrmStore((s) => s.opportunities)
  const addQuote = useCrmStore((s) => s.addQuote)
  const updateQuote = useCrmStore((s) => s.updateQuote)
  const deleteQuote = useCrmStore((s) => s.deleteQuote)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ customerName: '', opportunityId: '', itemName: '', itemPrice: '', branchId: 'charm-dn' })

  const stats = useMemo(() => ({
    total: quotes.length,
    enviadas: quotes.filter((q) => q.status === 'enviada').length,
    aceptadas: quotes.filter((q) => q.status === 'aceptada').length,
    valor: quotes.reduce((a, q) => a + (q.total || 0), 0),
  }), [quotes])

  const exportRows = useMemo(
    () => quotes.map((q) => ({
      numero: q.number,
      cliente: q.customerName,
      estado: QUOTE_STATUS_META[q.status]?.label || q.status,
      total: formatDOP(q.total),
      fecha: fmtDate(q.createdAt),
    })),
    [quotes]
  )

  const oppOptions = [{ value: '', label: 'Sin oportunidad' }, ...opportunities.map((o) => ({ value: o.id, label: o.title }))]

  const submit = () => {
    if (!form.customerName.trim()) return toast.error('Cliente requerido')
    const price = Number(form.itemPrice) || 0
    const items = form.itemName.trim() ? [{ name: form.itemName.trim(), qty: 1, price }] : []
    addQuote({
      customerName: form.customerName.trim(),
      opportunityId: form.opportunityId || null,
      items,
      total: price,
      branchId: form.branchId,
      validUntil: new Date(Date.now() + 15 * 86400000).toISOString(),
    })
    setModalOpen(false)
    setForm({ customerName: '', opportunityId: '', itemName: '', itemPrice: '', branchId: 'charm-dn' })
    toast.success('Cotización creada')
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-cotizaciones">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Cotizaciones</h2>
          <p className="text-sm text-slate-500">{stats.total} cotizaciones · {formatDOP(stats.valor)} en pipeline</p>
        </div>
        <div className="flex gap-2">
          <ExportMenu
            title="Cotizaciones CRM"
            columns={[
              { key: 'numero', label: 'Número' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'estado', label: 'Estado' },
              { key: 'total', label: 'Total' },
              { key: 'fecha', label: 'Fecha' },
            ]}
            rows={exportRows}
            filename="cotizaciones_crm"
          />
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva cotización
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Enviadas', value: stats.enviadas },
          { label: 'Aceptadas', value: stats.aceptadas },
          { label: 'Valor total', value: formatDOP(stats.valor) },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="font-heading text-xl font-bold text-slate-900">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {quotes.map((q) => (
          <Card key={q.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-700">{q.number}</span>
                  <Badge tone={QUOTE_STATUS_META[q.status]?.tone || 'neutral'}>{QUOTE_STATUS_META[q.status]?.label}</Badge>
                </div>
                <p className="mt-1 font-semibold text-slate-900">{q.customerName}</p>
                <p className="text-sm text-slate-500">Válida hasta {fmtDate(q.validUntil)}</p>
                {q.items?.length > 0 && (
                  <ul className="mt-2 text-sm text-slate-600">
                    {q.items.map((it, i) => (
                      <li key={i}>{it.name} × {it.qty} — {formatDOP(it.price)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center gap-3">
                <p className="font-heading text-lg font-bold text-emerald-600">{formatDOP(q.total)}</p>
                <Select
                  value={q.status}
                  onChange={(v) => updateQuote(q.id, { status: v })}
                  options={QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_META[s].label }))}
                  className="w-36"
                />
                <button type="button" onClick={() => { deleteQuote(q.id); toast.success('Eliminada') }} className="rounded-lg p-2 text-red-500 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva cotización">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Cliente</label>
            <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Oportunidad</label>
            <Select value={form.opportunityId} onChange={(v) => setForm((f) => ({ ...f, opportunityId: v }))} options={oppOptions} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Concepto principal</label>
            <Input value={form.itemName} onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Precio (DOP)</label>
            <Input type="number" value={form.itemPrice} onChange={(e) => setForm((f) => ({ ...f, itemPrice: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={submit}>Crear</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
