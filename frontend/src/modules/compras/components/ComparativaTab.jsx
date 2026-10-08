import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useComprasStore } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'
import { filterCategoriesForSection } from '@/lib/categories'
import { formatDOP } from '@/lib/format'
import { ChartCard } from '@/modules/reportes/components/ReportPrimitives'
import { CHART_ANIMATION } from '@/lib/chartAnimation'
import { useSessionStore } from '@/stores/sessionStore'
import { EmptyState } from '@/components/ui/EmptyState'

export function ComparativaTab() {
  const compareCatalog = useComprasStore((s) => s.compareCatalog)
  const categories = useConfigStore((s) => s.categories)
  const supplyCategories = filterCategoriesForSection(categories, 'catalog', 'insumo')
  const isOnline = useSessionStore((s) => s.isOnline())

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setRows([])
      return
    }
    setLoading(true)
    compareCatalog(
      {
        search: search.trim() || undefined,
        categoryId: categoryFilter === 'all' ? undefined : categoryFilter,
      },
      { isOnline }
    )
      .then((data) => setRows(data))
      .finally(() => setLoading(false))
  }, [search, categoryFilter, isOnline, compareCatalog])

  const chartData = useMemo(() => {
    return rows.slice(0, 8).map((row) => {
      const entry = { name: row.name }
      for (const offer of row.suppliers || []) {
        entry[offer.supplierName] = Number(offer.unitPrice)
      }
      return entry
    })
  }, [rows])

  const supplierNames = useMemo(() => {
    const names = new Set()
    rows.forEach((row) => row.suppliers?.forEach((offer) => names.add(offer.supplierName)))
    return [...names]
  }, [rows])

  const categoryName = (id) => supplyCategories.find((row) => row.id === id)?.name || '—'

  if (!isOnline) {
    return (
      <EmptyState
        title="Sin conexión"
        description="La comparativa de precios requiere conexión con el servidor."
        className="py-16"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(280px,1fr)_220px] lg:max-w-3xl">
        <Input
          icon={Search}
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[
            { value: 'all', label: 'Todas las categorías' },
            ...supplyCategories.map((row) => ({ value: row.id, label: row.name })),
          ]}
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando comparativa…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin datos" description="Agrega productos al catálogo de tus proveedores." className="py-12" />
      ) : (
        <>
          <ChartCard title="Precios por proveedor" subtitle="Hasta 8 productos con más ofertas">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => formatDOP(v)} width={72} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatDOP(value)} />
                  <Legend />
                  {supplierNames.map((name, index) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      fill={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][index % 4]}
                      {...CHART_ANIMATION}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Proveedores</th>
                  <th className="px-4 py-3 text-right">Más barato</th>
                  <th className="px-4 py-3 text-right">Spread</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cheapest = row.suppliers?.find(
                    (offer) => offer.supplierId === row.cheapestSupplierId
                  )
                  return (
                    <tr key={row.productKey} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                      <td className="px-4 py-3 text-slate-600">{categoryName(row.categoryId)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {(row.suppliers || [])
                          .map((offer) => `${offer.supplierName}: ${formatDOP(offer.unitPrice)}`)
                          .join(' · ')}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-800">
                        {cheapest ? `${cheapest.supplierName} · ${formatDOP(cheapest.unitPrice)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatDOP(row.spread)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
