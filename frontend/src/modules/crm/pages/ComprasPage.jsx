import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ShoppingBag } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { fmtDateTime } from '../lib/crm'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { METHOD_LABELS } from '../lib/crm'
import { cn } from '@/lib/utils'

export default function ComprasPage() {
  const customers = usePosStore((s) => s.customers)
  const sales = usePosStore((s) => s.sales)
  const [query, setQuery] = useState('')
  const [openIds, setOpenIds] = useState(new Set())

  const byCustomer = useMemo(() => {
    const map = {}
    sales.forEach((s) => {
      const id = s.customer?.id
      if (!id || id === 'walk-in') return
      if (!map[id]) map[id] = { customer: s.customer, sales: [], total: 0 }
      map[id].sales.push(s)
      map[id].total += s.total || 0
    })
    return map
  }, [sales])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers
      .filter((c) => c.id !== 'walk-in' && byCustomer[c.id])
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => (byCustomer[b.id]?.total || 0) - (byCustomer[a.id]?.total || 0))
  }, [customers, byCustomer, query])

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const grandTotal = list.reduce((a, c) => a + (byCustomer[c.id]?.total || 0), 0)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-compras">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Compras por Cliente</h2>
        <p className="text-sm text-slate-500">{list.length} clientes con compras · {formatDOP(grandTotal)} total</p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar cliente..."
        className="w-full max-w-md rounded-xl border-0 bg-white px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
      />

      <div className="space-y-2">
        {list.map((c) => {
          const data = byCustomer[c.id]
          const open = openIds.has(c.id)
          return (
            <Card key={c.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50/50"
              >
                <div className="flex items-center gap-3">
                  {open ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    <p className="text-sm text-slate-500">{data.sales.length} compra(s)</p>
                  </div>
                </div>
                <p className="font-heading text-lg font-bold text-emerald-600">{formatDOP(data.total)}</p>
              </button>
              {open && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400">
                        <th className="pb-2">Fecha</th>
                        <th className="pb-2">Método</th>
                        <th className="pb-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales.map((s) => (
                        <tr key={s.id} className="border-t border-slate-100">
                          <td className="py-2 text-slate-600">{fmtDateTime(s.createdAt)}</td>
                          <td className="py-2 text-slate-600">{METHOD_LABELS[s.paymentMethod] || s.paymentMethod}</td>
                          <td className={cn('py-2 text-right font-semibold text-slate-900')}>{formatDOP(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay compras registradas por cliente.</p>}
      </div>
    </div>
  )
}
