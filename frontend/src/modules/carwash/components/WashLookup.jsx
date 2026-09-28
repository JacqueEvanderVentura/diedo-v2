import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { carwashApi } from '../api'

// Server-side search and pagination keep large directories usable without loading them in full.
export function WashLookup({ branchId, kind, label, value, selectedName, onChange, disabled, optional = false }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 250)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    let active = true
    setLoading(true); setError(null)
    carwashApi.washOptions({ branchId, kind, search: query || undefined, page, pageSize: 20 })
      .then((data) => { if (active) setResult(data) })
      .catch((failure) => { if (active) { setError(failure); setResult(null) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [branchId, kind, query, page, revision])
  const items = result?.items || []
  const options = items.map((item) => ({ value: item.id, label: item.name }))
  if (value && !items.some((item) => item.id === value)) options.unshift({ value, label: selectedName || 'Selección actual' })
  if (optional) options.unshift({ value: '', label: 'Sin selección' })
  return <div className="min-w-0 space-y-2" data-testid={`wash-lookup-${label}`}>
    <span className="block text-xs font-semibold text-slate-700">{label}</span>
    <Input aria-label={`Buscar ${label.toLowerCase()}`} placeholder="Escribe para buscar…" maxLength={100} value={search} disabled={disabled} onChange={(event) => setSearch(event.target.value)} />
    <Select aria-label={label} value={value || ''} options={options} disabled={disabled || loading || !!error} placeholder={loading ? 'Cargando…' : 'Seleccionar…'} onChange={(id) => onChange(items.find((item) => item.id === id) || (id ? { id, name: selectedName } : null))} />
    {error && <p role="alert" className="text-xs text-red-700">{error.message || 'No se pudieron cargar las opciones.'}</p>}
    {!loading && !error && !items.length && <p className="text-xs text-slate-500">No hay resultados disponibles en esta sucursal.</p>}
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <Button type="button" size="sm" variant="ghost" disabled={loading || disabled} onClick={() => setRevision((n) => n + 1)} aria-label={`Actualizar ${label.toLowerCase()}`}>Actualizar</Button>
      {result?.totalPages > 1 && <><Button type="button" size="sm" variant="ghost" disabled={loading || disabled || page <= 1} onClick={() => setPage(page - 1)} aria-label={`Anterior ${label}`}>←</Button><span>{page} / {result.totalPages}</span><Button type="button" size="sm" variant="ghost" disabled={loading || disabled || page >= result.totalPages} onClick={() => setPage(page + 1)} aria-label={`Siguiente ${label}`}>→</Button></>}
    </div>
  </div>
}
