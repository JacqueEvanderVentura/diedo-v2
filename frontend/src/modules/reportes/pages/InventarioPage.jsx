import { useMemo, useCallback, useState } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Package, Boxes, AlertTriangle } from 'lucide-react'
import { useCatalogStore, LOW_STOCK_THRESHOLD } from '@/stores/catalogStore'
import { CATEGORIES } from '@/data/products'
import { formatDOP } from '@/lib/format'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import { mockFromId } from '../lib/reportes'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { fetchInventoryReport } from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import { Select } from '@/components/ui/Select'

const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || id
const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b']

function StockTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label ?? payload[0].name}</p>
      <p className="font-heading text-sm font-bold text-slate-900">{payload[0].value} uds</p>
    </div>
  )
}

export default function InventarioPage() {
  const products = useCatalogStore((s) => s.products)
  const [branchId, setBranchId] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')

  const stockItems = useMemo(() => products.filter((p) => p.type === 'product' && p.stock !== null), [products])

  const stats = useMemo(() => {
    const withStock = stockItems.filter((p) => p.stock > 0)
    const value = stockItems.reduce((a, p) => a + p.price * (p.stock || 0), 0)
    const low = stockItems.filter((p) => p.stock <= LOW_STOCK_THRESHOLD).length
    return { count: withStock.length, value, low }
  }, [stockItems])

  const stockBars = useMemo(
    () => stockItems.filter((p) => p.stock > 0).sort((a, b) => b.stock - a.stock).slice(0, 8).map((p) => ({ label: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name, value: p.stock })),
    [stockItems]
  )

  const rotationBars = useMemo(
    () => [...stockItems].map((p) => ({ label: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name, value: mockFromId(p.id, 4, 46) })).sort((a, b) => b.value - a.value).slice(0, 8),
    [stockItems]
  )

  const valueByCat = useMemo(() => {
    const map = {}
    stockItems.forEach((p) => { map[p.category] = (map[p.category] || 0) + p.price * (p.stock || 0) })
    return Object.entries(map).filter(([, v]) => v > 0).map(([id, value]) => ({ id, name: catName(id), value }))
  }, [stockItems])

  const getProducts = useCallback(() => products, [products])
  const fetcher = useCallback(
    (params) => fetchInventoryReport(getProducts, { ...params, branchId, category, search }),
    [getProducts, branchId, category, search]
  )
  const tableReport = usePaginatedReport(fetcher, {}, 10)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <ReportFilterBar
        branchId={branchId}
        onBranchChange={setBranchId}
        search={search}
        onSearchChange={(v) => { setSearch(v); tableReport.setPage(1) }}
        searchPlaceholder="Buscar producto…"
        onRefresh={tableReport.reload}
        extra={(
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Categoría</label>
            <Select
              value={category}
              onChange={(v) => { setCategory(v); tableReport.setPage(1) }}
              options={[{ value: '', label: 'Todas' }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Productos con stock" value={stats.count} icon={Boxes} tone="brand" testId="report-stat-inv-count" />
        <StatCard label="Valor de inventario" value={formatDOP(stats.value)} icon={Package} tone="emerald" testId="report-stat-inv-value" />
        <StatCard label="Bajo stock" value={stats.low} icon={AlertTriangle} tone="amber" sub={`≤ ${LOW_STOCK_THRESHOLD} unidades`} testId="report-stat-inv-low" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Stock actual por producto" subtitle="Top 8 por unidades disponibles" testId="report-inv-stock">
          {stockBars.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin productos con stock</p>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <BarChart data={stockBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={110} />
                  <Tooltip content={<StockTip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Rotación estimada (mock)" subtitle="Unidades vendidas aprox. / mes" testId="report-inv-rotation">
          {rotationBars.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin datos</p>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <BarChart data={rotationBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={110} />
                  <Tooltip content={<StockTip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {valueByCat.length > 0 && (
        <ChartCard title="Valor de inventario por categoría" subtitle="Distribución del capital en stock" testId="report-inv-category">
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height={240} minWidth={0}>
                <PieChart>
                  <Pie data={valueByCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} isAnimationActive={false}>
                    {valueByCat.map((e, i) => <Cell key={e.id} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatDOP(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5">
              {valueByCat.map((e, i) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /> {e.name}
                  </span>
                  <span className="font-semibold text-slate-800">{formatDOP(e.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-heading text-base font-semibold text-slate-800">Detalle de productos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Costo und.</th>
                <th className="px-4 py-3 text-right">Precio und.</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Cant. vendida</th>
                <th className="px-4 py-3 text-right">Ingresos</th>
                <th className="px-4 py-3 text-right">Ganancia est.</th>
              </tr>
            </thead>
            <tbody>
              {tableReport.loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
              ) : tableReport.items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Sin productos</td></tr>
              ) : (
                tableReport.items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatDOP(row.cost)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatDOP(row.price)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{row.stock}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{row.sold}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{formatDOP(row.revenue)}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatDOP(row.profit)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 pb-4">
          <Pagination
            page={tableReport.page}
            totalPages={tableReport.totalPages}
            total={tableReport.total}
            from={tableReport.from}
            to={tableReport.to}
            pageSize={tableReport.pageSize}
            onPageChange={tableReport.setPage}
            onPageSizeChange={tableReport.setPageSize}
            noun="productos"
          />
        </div>
      </div>
    </div>
  )
}
