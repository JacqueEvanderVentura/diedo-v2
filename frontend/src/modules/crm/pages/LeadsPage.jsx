import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { List, Search, Sparkles, SlidersHorizontal, MapPin, Phone, Globe, Import, UserCheck, Briefcase } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { searchBusinesses } from '@/services/leadSearch'
import {
  DIEDO_MODULES,
  MODULE_LABELS,
  LEAD_STATUS_META,
  LEAD_STATUSES,
  SOURCE_LABELS,
} from '@/data/crm'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { buildBranchFilterOptions } from '@/lib/branches'
import { useConfigStore } from '@/stores/configStore'
import { ModuleFitBars, ScoreBadge } from '../components/ModuleFitBars'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'lista', label: 'Lista', icon: List },
  { id: 'descubrir', label: 'Descubrir', icon: Sparkles },
  { id: 'criterios', label: 'Criterios', icon: SlidersHorizontal },
]

function LeadsListaTab() {
  const leads = useCrmStore((s) => s.leads)
  const branches = useConfigStore((s) => s.branches)
  const setManualScore = useCrmStore((s) => s.setManualScore)
  const convertToCustomer = useCrmStore((s) => s.convertToCustomer)
  const addToPipeline = useCrmStore((s) => s.addToPipeline)
  const updateLead = useCrmStore((s) => s.updateLead)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [editingScore, setEditingScore] = useState(null)
  const [manualVal, setManualVal] = useState('')
  const [manualNotes, setManualNotes] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (branchFilter !== 'all' && l.branchId !== branchFilter) return false
      if (!q) return true
      return [l.name, l.company, l.location, l.phone, l.email].some((f) => f && `${f}`.toLowerCase().includes(q))
    })
  }, [leads, query, statusFilter, branchFilter])

  const saveManual = (id) => {
    setManualScore(id, manualVal, manualNotes)
    setEditingScore(null)
    toast.success('Score manual guardado')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar leads..."
            className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={[{ value: 'all', label: 'Todos los estados' }, ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_META[s].label }))]}
          className="w-full sm:w-48"
        />
        <Select
          value={branchFilter}
          onChange={setBranchFilter}
          options={buildBranchFilterOptions(branches)}
          className="w-full sm:w-48"
          data-testid="leads-branch-filter"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((lead) => {
          const meta = LEAD_STATUS_META[lead.status]
          return (
            <Card key={lead.id} className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-semibold text-slate-900">{lead.company || lead.name}</h3>
                    <ScoreBadge score={lead.score} />
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <Badge tone="neutral">{SOURCE_LABELS[lead.source] || lead.source}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                    {lead.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{lead.location}</span>}
                    {lead.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>}
                    {lead.website && <span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{lead.website}</span>}
                  </div>
                  {lead.rawSnippet && <p className="text-sm text-slate-500">{lead.rawSnippet}</p>}
                  <ModuleFitBars moduleFits={lead.moduleFits} compact />
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {lead.phone && (
                    <WhatsAppMenuButton
                      phone={lead.phone}
                      context="oportunidades"
                      size="sm"
                      variables={{
                        nombre_cliente: lead.name || lead.company || '',
                        empresa: lead.company || lead.name || '',
                        ubicacion: lead.location || '',
                      }}
                      data-testid={`lead-wa-${lead.id}`}
                    />
                  )}
                  {lead.status !== 'convertido' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => { setEditingScore(lead.id); setManualVal(lead.scoreManual ?? ''); setManualNotes(lead.scoreNotes || '') }}>
                        Score
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { addToPipeline(lead.id); toast.success('Enviado al pipeline') }}>
                        <Briefcase className="h-3.5 w-3.5" /> Pipeline
                      </Button>
                      <Button size="sm" onClick={() => { convertToCustomer(lead.id); toast.success('Convertido a cliente') }}>
                        <UserCheck className="h-3.5 w-3.5" /> Convertir
                      </Button>
                    </>
                  )}
                  <Select
                    value={lead.status}
                    onChange={(v) => updateLead(lead.id, { status: v })}
                    options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_META[s].label }))}
                    className="w-36"
                  />
                </div>
              </div>
              {editingScore === lead.id && (
                <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-slate-500">Score manual (0-100)</span>
                    <input type="number" min={0} max={100} value={manualVal} onChange={(e) => setManualVal(e.target.value)} className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block text-xs text-slate-500">Notas</span>
                    <input value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <Button size="sm" onClick={() => saveManual(lead.id)}>Guardar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingScore(null)}>Cancelar</Button>
                </div>
              )}
            </Card>
          )
        })}
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay leads que coincidan.</p>}
      </div>
    </div>
  )
}

function LeadsDescubrirTab() {
  const addLeadsBatch = useCrmStore((s) => s.addLeadsBatch)

  const [q, setQ] = useState('')
  const [location, setLocation] = useState('Santo Domingo, República Dominicana')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())

  const runSearch = async () => {
    if (!q.trim()) return toast.error('Ingresa un término de búsqueda')
    setLoading(true)
    setResults([])
    setSelected(new Set())
    try {
      const { results: found } = await searchBusinesses({ q: q.trim(), location: location.trim(), num: 10 })
      setResults(found)
      if (found.length === 0) toast.info('Sin resultados para esta búsqueda')
    } catch (err) {
      if (err.code === 'QUOTA_EXCEEDED') toast.error('Límite de búsquedas alcanzado. Intenta más tarde.')
      else toast.error('No se pudo completar la búsqueda. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = (idx) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const importSelected = () => {
    const items = [...selected].map((i) => results[i])
    if (!items.length) return toast.error('Selecciona al menos un resultado')
    addLeadsBatch(items, 'serp')
    toast.success(`${items.length} lead(s) importados y puntuados`)
    setResults([])
    setSelected(new Set())
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: salón de belleza, restaurante..." className="rounded-xl border-0 bg-white px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ubicación" className="rounded-xl border-0 bg-white px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
      </div>
      <Button onClick={runSearch} disabled={loading}>
        <Search className="h-4 w-4" /> {loading ? 'Buscando...' : 'Buscar negocios'}
      </Button>

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{results.length} resultados · {selected.size} seleccionados</p>
            <Button onClick={importSelected} disabled={selected.size === 0}>
              <Import className="h-4 w-4" /> Importar seleccionados
            </Button>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <label key={i} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors', selected.has(i) ? 'border-blue-300 bg-blue-50/50' : 'border-slate-100 bg-white')}>
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="mt-1" />
                <div>
                  <p className="font-semibold text-slate-900">{r.name}</p>
                  {r.location && <p className="text-sm text-slate-500">{r.location}</p>}
                  {r.rawSnippet && <p className="mt-1 text-xs text-slate-400">{r.rawSnippet}</p>}
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LeadsCriteriosTab() {
  const scoringWeights = useCrmStore((s) => s.scoringWeights)
  const updateScoringWeights = useCrmStore((s) => s.updateScoringWeights)
  const [local, setLocal] = useState({ ...scoringWeights })

  const setWeight = (mod, val) => setLocal((p) => ({ ...p, [mod]: Number(val) }))

  const save = () => {
    updateScoringWeights(local)
    toast.success('Pesos actualizados — scores recalculados')
  }

  return (
    <Card className="p-6">
      <h3 className="font-heading text-lg font-semibold text-slate-900">Pesos del scoring automático</h3>
      <p className="mt-1 text-sm text-slate-500">Ajusta la importancia de cada módulo Diedo al calcular el fit del lead.</p>
      <div className="mt-6 space-y-5">
        {DIEDO_MODULES.map((mod) => (
          <div key={mod}>
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-medium text-slate-700">{MODULE_LABELS[mod]}</span>
              <span className="text-slate-500">{local[mod]?.toFixed(1) ?? 1}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={local[mod] ?? 1}
              onChange={(e) => setWeight(mod, e.target.value)}
              className="w-full accent-blue-600"
            />
          </div>
        ))}
      </div>
      <Button className="mt-6" onClick={save}>Guardar criterios</Button>
    </Card>
  )
}

export default function LeadsPage() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') || 'lista'
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'lista'

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-leads">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Leads</h2>
        <p className="text-sm text-slate-500">Encuentra, puntúa y convierte leads potenciales.</p>
      </div>

      <div className="grid w-full max-w-lg grid-cols-3 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setParams({ tab: t.id })}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      <AnimatedTabPanel panelKey={tab}>
        {tab === 'descubrir' && <LeadsDescubrirTab />}
        {tab === 'criterios' && <LeadsCriteriosTab />}
        {tab === 'lista' && <LeadsListaTab />}
      </AnimatedTabPanel>
    </div>
  )
}
