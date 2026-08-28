import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, GripVertical } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { useConfigStore } from '@/stores/configStore'
import { buildBranchFilterOptions } from '@/lib/branches'
import { OPPORTUNITY_STAGES, STAGE_META } from '@/data/crm'
import { formatDOP } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'

function DealCard({ opp, onDragStart }) {
  const meta = STAGE_META[opp.stage]
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, opp.id)}
      className="cursor-grab rounded-xl border border-slate-100 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{opp.title}</p>
          <p className="text-xs text-slate-500">{opp.customerName}</p>
          <p className="mt-2 font-heading text-sm font-bold text-emerald-600">{formatDOP(opp.value)}</p>
        </div>
      </div>
      <div className="mt-2">
        <span className={cn('inline-block h-1 w-full rounded-full', meta.color)} />
      </div>
    </div>
  )
}

export default function PipelinePage() {
  const opportunities = useCrmStore((s) => s.opportunities)
  const branches = useConfigStore((s) => s.branches)
  const updateOpportunityStage = useCrmStore((s) => s.updateOpportunityStage)
  const addOpportunity = useCrmStore((s) => s.addOpportunity)
  const leads = useCrmStore((s) => s.leads)

  const [modalOpen, setModalOpen] = useState(false)
  const [branchFilter, setBranchFilter] = useState('all')
  const [form, setForm] = useState({ title: '', customerName: '', value: '', leadId: '', stage: 'nuevo' })
  const [dragId, setDragId] = useState(null)

  const filteredOpportunities = useMemo(() => {
    if (branchFilter === 'all') return opportunities
    return opportunities.filter((o) => o.branchId === branchFilter)
  }, [opportunities, branchFilter])

  const byStage = useMemo(() => {
    const map = Object.fromEntries(OPPORTUNITY_STAGES.map((s) => [s, []]))
    filteredOpportunities.forEach((o) => {
      if (map[o.stage]) map[o.stage].push(o)
    })
    return map
  }, [filteredOpportunities])

  const totals = useMemo(() => {
    const open = opportunities.filter((o) => !['cerrado', 'perdido'].includes(o.stage))
    return { count: open.length, value: open.reduce((a, o) => a + (o.value || 0), 0) }
  }, [opportunities])

  const onDragStart = (e, id) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = (stage) => {
    if (!dragId) return
    updateOpportunityStage(dragId, stage)
    setDragId(null)
    toast.success(`Movido a ${STAGE_META[stage].label}`)
  }

  const submit = () => {
    if (!form.title.trim() || !form.customerName.trim()) return toast.error('Título y cliente requeridos')
    addOpportunity({
      title: form.title.trim(),
      customerName: form.customerName.trim(),
      value: Number(form.value) || 0,
      leadId: form.leadId || null,
      stage: form.stage,
      branchId: 'charm-dn',
      assignedUserId: 'u1',
    })
    setModalOpen(false)
    setForm({ title: '', customerName: '', value: '', leadId: '', stage: 'nuevo' })
    toast.success('Oportunidad creada')
  }

  const leadOptions = [{ value: '', label: 'Sin lead' }, ...leads.filter((l) => l.status !== 'convertido').map((l) => ({ value: l.id, label: l.company || l.name }))]

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6 sm:p-8" data-testid="crm-pipeline">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Pipeline</h2>
          <p className="text-sm text-slate-500">{totals.count} oportunidades abiertas · {formatDOP(totals.value)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={branchFilter} onChange={setBranchFilter} options={buildBranchFilterOptions(branches)} className="min-w-[180px]" data-testid="pipeline-branch-filter" />
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva oportunidad
          </Button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {OPPORTUNITY_STAGES.map((stage) => {
          const meta = STAGE_META[stage]
          const deals = byStage[stage] || []
          const stageValue = deals.reduce((a, o) => a + (o.value || 0), 0)
          return (
            <div
              key={stage}
              className="w-72 shrink-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(stage)}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', meta.color)} />
                  <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{deals.length}</span>
                </div>
              </div>
              <p className="mb-3 text-xs text-slate-400">{formatDOP(stageValue)}</p>
              <div className="space-y-2 min-h-[120px] rounded-xl bg-slate-50/80 p-2">
                {deals.map((opp) => (
                  <DealCard key={opp.id} opp={opp} onDragStart={onDragStart} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva oportunidad">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Título</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Cliente</label>
            <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Valor (DOP)</label>
            <Input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Lead origen</label>
            <Select value={form.leadId} onChange={(v) => setForm((f) => ({ ...f, leadId: v }))} options={leadOptions} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Etapa inicial</label>
            <Select value={form.stage} onChange={(v) => setForm((f) => ({ ...f, stage: v }))} options={OPPORTUNITY_STAGES.map((s) => ({ value: s, label: STAGE_META[s].label }))} />
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
