import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Star } from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { REVIEW_STATUS_META } from '@/data/rrhh'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { fullName, initials } from '../lib/rrhh'
import { cn } from '@/lib/utils'

export default function PerformancePage() {
  const employees = useRrhhStore((s) => s.employees)
  const performanceReviews = useRrhhStore((s) => s.performanceReviews)
  const addPerformanceReview = useRrhhStore((s) => s.addPerformanceReview)
  const updatePerformanceReview = useRrhhStore((s) => s.updatePerformanceReview)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ employeeId: '', period: '2026-Q2', score: '4', notes: '', status: 'borrador' })

  const published = useMemo(() => performanceReviews.filter((r) => r.status === 'publicado'), [performanceReviews])

  const avgScore = useMemo(() => {
    if (!published.length) return 0
    return published.reduce((s, r) => s + r.score, 0) / published.length
  }, [published])

  const distribution = useMemo(() => {
    const buckets = { '1-2': 0, '2-3': 0, '3-4': 0, '4-5': 0 }
    published.forEach((r) => {
      if (r.score < 2) buckets['1-2']++
      else if (r.score < 3) buckets['2-3']++
      else if (r.score < 4) buckets['3-4']++
      else buckets['4-5']++
    })
    return buckets
  }, [published])

  const submit = () => {
    if (!form.employeeId) return toast.error('Selecciona un empleado')
    if (!form.notes.trim()) return toast.error('Ingresa notas de evaluación')
    addPerformanceReview({ ...form, score: Number(form.score) })
    toast.success('Evaluación creada')
    setModalOpen(false)
    setForm({ employeeId: '', period: '2026-Q2', score: '4', notes: '', status: 'borrador' })
  }

  const publish = (id) => {
    updatePerformanceReview(id, { status: 'publicado' })
    toast.success('Evaluación publicada')
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="rrhh-performance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 flex-1">
          <Card className="p-5">
            <p className="text-xs font-bold uppercase text-slate-400">Promedio del equipo</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="font-heading text-3xl font-bold text-amber-500">{avgScore.toFixed(1)}</p>
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
            </div>
          </Card>
          <Card className="p-5">
            <p className="mb-2 text-xs font-bold uppercase text-slate-400">Distribución</p>
            <div className="space-y-1.5">
              {Object.entries(distribution).map(([range, count]) => (
                <div key={range} className="flex items-center gap-2 text-sm">
                  <span className="w-10 text-slate-500">{range}</span>
                  <div className="h-2 flex-1 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${published.length ? (count / published.length) * 100 : 0}%` }} />
                  </div>
                  <span className="w-6 text-right text-slate-600">{count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Nueva evaluación</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {performanceReviews.map((rev) => {
          const emp = employees.find((e) => e.id === rev.employeeId)
          const meta = REVIEW_STATUS_META[rev.status]
          return (
            <Card key={rev.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50 text-xs font-bold text-cyan-700">
                    {initials(emp)}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{fullName(emp)}</p>
                    <p className="text-xs text-slate-400">{rev.period}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="h-4 w-4 fill-current" />
                  <span className="font-bold">{rev.score}</span>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600 line-clamp-3">{rev.notes}</p>
              <div className="mt-4 flex items-center justify-between">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                {rev.status === 'borrador' && (
                  <Button size="sm" variant="secondary" onClick={() => publish(rev.id)}>Publicar</Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva evaluación">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Empleado</label>
            <Select value={form.employeeId} onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))} options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: fullName(e) }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Periodo</label>
            <Input value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} placeholder="2026-Q2" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Puntuación (1-5)</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, score: String(n) }))}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-bold transition-colors',
                    Number(form.score) === n ? 'border-amber-400 bg-amber-50 text-amber-600' : 'border-slate-200 text-slate-500'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              className="w-full rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
              placeholder="Comentarios sobre el desempeño..."
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={submit}>Guardar borrador</Button>
        </div>
      </Modal>
    </div>
  )
}
