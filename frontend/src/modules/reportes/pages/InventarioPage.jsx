import { useMemo, useCallback, useState } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Package, Boxes, AlertTriangle } from 'lucide-react'
import { useCatalogStore, LOW_STOCK_THRESHOLD } from '@/stores/catalogStore'
import { usePosStore } from '@/stores/posStore'
import { CATEGORIES } from '@/data/products'
import { formatDOP } from '@/lib/format'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { fetchInventoryReport } from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { Select } from '@/components/ui/Select'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'

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
  const sales = usePosStore((s) => s.sales)
  const [branchId, setBranchId] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')

  const stockItems = useMemo(() => products.filter((p) => p.type === 'product' && p.stock !== null), [products])

  const stats = useMemo(() => {
    const withStock = stockItems.filter((p) => p.stock > 0)
    const valueCost = stockItems.reduce((a, p) => a + (Number(p.cost) || Number(p.price) * 0.6 || 0) * (p.stock || 0), 0)
    const valueSale = stockItems.reduce((a, p) => a + (Number(p.price) || 0) * (p.stock || 0), 0)
    const low = stockItems.filter((p) => p.stock <= LOW_STOCK_THRESHOLD).length
    return { count: withStock.length, valueCost, valueSale, low }
  }, [stockItems])

  const stockBars = useMemo(
    () => stockItems.filter((p) => p.stock > 0).sort((a, b) => b.stock - a.stock).slice(0, 8).map((p) => ({ label: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name, value: p.stock })),
    [stockItems]
  )

  const valueByCat = useMemo(() => {
    const map = {}
    stockItems.forEach((p) => {
      const unitCost = Number(p.cost) || Number(p.price) * 0.6 || 0
      map[p.category] = (map[p.category] || 0) + unitCost * (p.stock || 0)
    })
    return Object.entries(map).filter(([, v]) => v > 0).map(([id, value]) => ({ id, name: catName(id), value }))
  }, [stockItems])

  const marginBars = useMemo(() => {
    return stockItems
      .filter((p) => p.price > 0)
      .map((p) => {
        const cost = Number(p.cost) || p.price * 0.6
        const margin = p.price > 0 ? ((p.price - cost) / p.price) * 100 : 0
        return { label: p.name.length > 14 ? `${p.name.slice(0, 14)}…` : p.name, margin: Number(margin.toFixed(1)) }
      })
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 8)
  }, [stockItems])

  const getProducts = useCallback(() => products, [products])
  const getSales = useCallback(() => sales, [sales])
  const fetcher = useCallback(
    (params) => fetchInventoryReport(getProducts, getSales, { ...params, branchId, category, search }),
    [getProducts, getSales, branchId, category, search]
  )
  const tableReport = usePaginatedReport(fetcher, {}, 10, { key: 'name', dir: 'asc' })

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Productos con stock" value={stats.count} icon={Boxes} tone="brand" testId="report-stat-inv-count" />
        <StatCard label="Valor inventario (costo)" value={formatDOP(stats.valueCost)} icon={Package} tone="emerald" testId="report-stat-inv-value-cost" />
        <StatCard label="Valor inventario (venta)" value={formatDOP(stats.valueSale)} icon={Package} tone="brand" testId="report-stat-inv-value-sale" />
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

        <ChartCard title="Margen costo vs venta" subtitle="Top 8 por % de margen" testId="report-inv-margin">
          {marginBars.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin productos</p>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <BarChart data={marginBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} unit="%" />
                  <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="margin" fill="#10b981" radius={[0, 6, 6, 0]} isAnimationActive={false} />
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
        <ResponsiveList columnCount={10}>
          <ResponsiveTable testId="report-inventario-table" wrapCard={false}>
            <SortableTableProvider sortKey={tableReport.sortKey} sortDir={tableReport.sortDir} onSort={tableReport.toggleSort}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <SortableTh column="name" className="px-4 py-3">Producto</SortableTh>
                  <SortableTh column="cost" align="right" className="px-4 py-3">Costo und.</SortableTh>
                  <SortableTh column="price" align="right" className="px-4 py-3">Precio und.</SortableTh>
                  <SortableTh column="stock" align="right" className="px-4 py-3">Stock</SortableTh>
                  <SortableTh column="stockValueCost" align="right" className="px-4 py-3">Val. costo</SortableTh>
                  <SortableTh column="stockValueSale" align="right" className="px-4 py-3">Val. venta</SortableTh>
                  <SortableTh column="sold" align="right" className="px-4 py-3">Cant. vendida</SortableTh>
                  <SortableTh column="revenue" align="right" className="px-4 py-3">Ingresos</SortableTh>
                  <SortableTh column="profit" align="right" className="px-4 py-3">Ganancia est.</SortableTh>
                  <SortableTh column="marginPct" align="right" className="px-4 py-3">Margen %</SortableTh>
                </tr>
              </thead>
              <tbody>
                {tableReport.loading ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
                ) : tableReport.items.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Sin productos</td></tr>
                ) : (
                  tableReport.items.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatDOP(row.cost)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatDOP(row.price)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.stock}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatDOP(row.stockValueCost)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatDOP(row.stockValueSale)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.sold}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{formatDOP(row.revenue)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatDOP(row.profit)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{row.marginPct}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="report-inventario-cards" className="p-4">
            {!tableReport.loading && tableReport.items.map((row) => (
              <MobileCard key={row.id} testId={`report-inventario-card-${row.id}`}>
                <MobileCardHeader title={row.name} subtitle={`Margen ${row.marginPct}%`} />
                <MobileCardGrid>
                  <MobileField label="Costo und.">{formatDOP(row.cost)}</MobileField>
                  <MobileField label="Precio und.">{formatDOP(row.price)}</MobileField>
                  <MobileField label="Stock">{row.stock}</MobileField>
                  <MobileField label="Vendida">{row.sold}</MobileField>
                  <MobileField label="Ingresos">{formatDOP(row.revenue)}</MobileField>
                  <MobileField label="Ganancia est.">
                    <span className="font-medium text-emerald-600">{formatDOP(row.profit)}</span>
                  </MobileField>
                  <MobileField label="Val. costo" fullWidth>{formatDOP(row.stockValueCost)}</MobileField>
                  <MobileField label="Val. venta" fullWidth>{formatDOP(row.stockValueSale)}</MobileField>
                </MobileCardGrid>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
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
