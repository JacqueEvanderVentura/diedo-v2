import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CustomerPicker } from '@/components/customers/CustomerPicker'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { formatDOP, formatNumber } from '@/lib/format'
import { calculatePosTotals } from '@/modules/pos/lib/openAccount'

function parseLocaleNumber(raw) {
  const cleaned = String(raw ?? '').trim().replace(/,/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function saleToForm(sale) {
  const discountMode = sale.discountAmt > 0 ? 'amount' : 'percent'
  const discountValue = discountMode === 'amount' ? sale.discountAmt : (sale.discountPct || 0)
  return {
    customer: sale.customer || null,
    method: sale.method || 'efectivo',
    reference: sale.reference || '',
    notes: sale.notes || '',
    discountMode,
    discountValue,
    items: (sale.items || []).map((item) => ({
      ...item,
      qty: item.qty ?? 1,
      price: item.price ?? 0,
    })),
  }
}

const DISCOUNT_MODE_OPTIONS = [
  { value: 'percent', label: '%' },
  { value: 'amount', label: 'RD$' },
]

function FormattedPriceInput({ value, onChange, testId, className }) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  const bump = (delta) => {
    const next = Math.max(0, (Number(value) || 0) + delta)
    onChange(next)
    if (focused) setDraft(String(next))
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? draft : formatNumber(value)}
      onFocus={() => {
        setFocused(true)
        setDraft(String(value ?? ''))
      }}
      onBlur={() => {
        const n = parseLocaleNumber(draft)
        onChange(n)
        setFocused(false)
      }}
      onChange={(event) => {
        const next = event.target.value
        setDraft(next)
        onChange(parseLocaleNumber(next))
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          bump(1)
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          bump(-1)
        }
      }}
      className={className}
      data-testid={testId}
    />
  )
}

export function SaleEditModal({ open, onClose, sale, onSaved, nested = false }) {
  const paymentMethods = useConfigStore((s) => s.paymentMethods)
  const taxPct = useConfigStore((s) => s.settings?.taxPct ?? 18)
  const updateSale = usePosStore((s) => s.updateSale)
  const registerOpen = usePosStore((s) => s.register?.open)
  const mutating = usePosStore((s) => s.mutating)
  const [form, setForm] = useState(() => saleToForm(sale || { items: [] }))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && sale) setForm(saleToForm(sale))
  }, [open, sale])

  const paymentMethodOptions = useMemo(() => {
    const enabled = paymentMethods.filter((method) => method.enabled !== false)
    const enabledIds = new Set(enabled.map((method) => method.id))
    const current = paymentMethods.find((method) => method.id === form.method)
    const list = [...enabled]
    if (current && !enabledIds.has(current.id)) {
      list.unshift(current)
    }
    return list.map((method) => ({
      value: method.id,
      label: method.name || method.label || method.id,
    }))
  }, [paymentMethods, form.method])

  const totals = useMemo(
    () => calculatePosTotals({
      items: form.items,
      discountMode: form.discountMode,
      discountValue: form.discountValue,
      taxPct,
    }),
    [form.discountMode, form.discountValue, form.items, taxPct]
  )

  const updateLine = (index, patch) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, idx) => (idx === index ? { ...line, ...patch } : line)),
    }))
  }

  const handleSave = async () => {
    if (!registerOpen) {
      toast.error('Abre la caja de la sucursal para editar la factura.')
      return
    }
    if (!form.items.length) {
      toast.error('La factura debe tener al menos una línea.')
      return
    }
    setSaving(true)
    try {
      await updateSale(sale.id, form, sale)
      toast.success('Factura actualizada')
      onSaved?.()
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar la factura.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar factura" testId="sale-edit-modal" wide nested={nested}>
      <div className="space-y-4">
        {!registerOpen && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Abre la caja de la sucursal antes de guardar los cambios.
          </p>
        )}
        <CustomerPicker
          value={form.customer}
          onChange={(customer) => setForm((current) => ({ ...current, customer }))}
        />
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Artículo</th>
                <th className="px-4 py-3 text-center">Cant.</th>
                <th className="px-4 py-3 text-right">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {form.items.map((item, index) => {
                if (item.kind === 'section') {
                  return (
                    <tr key={`${item.id}-${index}`} className="bg-slate-50">
                      <td colSpan={3} className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                        {item.title || item.name}
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={`${item.id}-${index}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.qty}
                        onChange={(event) => updateLine(index, { qty: Number(event.target.value) })}
                        className="w-20 rounded-lg border-0 bg-white px-2 py-1 text-center text-sm ring-1 ring-inset ring-slate-200"
                        data-testid={`sale-edit-qty-${index}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <FormattedPriceInput
                        value={item.price}
                        onChange={(price) => updateLine(index, { price })}
                        className="w-28 rounded-lg border-0 bg-white px-2 py-1 text-right text-sm ring-1 ring-inset ring-slate-200"
                        testId={`sale-edit-price-${index}`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Forma de pago</span>
            <Select
              value={form.method}
              onChange={(method) => setForm((current) => ({ ...current, method }))}
              options={paymentMethodOptions}
              data-testid="sale-edit-method"
            />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Referencia</span>
            <input
              value={form.reference}
              onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
              className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm ring-1 ring-inset ring-slate-200"
              data-testid="sale-edit-reference"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Descuento</span>
            <div className="flex gap-2">
              <Select
                value={form.discountMode}
                onChange={(discountMode) => setForm((current) => ({
                  ...current,
                  discountMode,
                }))}
                options={DISCOUNT_MODE_OPTIONS}
                size="sm"
                className="w-24 shrink-0"
                data-testid="sale-edit-discount-mode"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={form.discountValue}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  discountValue: Number(event.target.value),
                }))}
                className="min-w-0 flex-1 rounded-xl border-0 bg-white px-3 py-2.5 text-sm ring-1 ring-inset ring-slate-200"
                data-testid="sale-edit-discount-value"
              />
            </div>
          </label>
          <div className="text-right text-sm text-slate-600">
            <p>Subtotal: {formatDOP(totals.subtotal)}</p>
            <p className="font-heading text-lg font-bold text-slate-900">Total: {formatDOP(totals.total)}</p>
          </div>
        </div>
        <textarea
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          rows={2}
          placeholder="Notas"
          className="w-full resize-none rounded-xl border-0 bg-white px-4 py-3 text-sm ring-1 ring-inset ring-slate-200"
          data-testid="sale-edit-notes"
        />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={saving || Boolean(mutating)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || Boolean(mutating)} data-testid="sale-edit-save">
            Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  )
}