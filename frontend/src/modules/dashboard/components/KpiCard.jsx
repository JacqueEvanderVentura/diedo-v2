import { motion } from 'framer-motion'
import * as Icons from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatDOP, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const toneStyles = {
  brand: 'bg-blue-50 text-blue-600',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
}

function renderValue(kpi) {
  if (kpi.value === null || kpi.value === undefined) return '—'
  if (kpi.kind === 'currency') return formatDOP(kpi.value)
  if (kpi.kind === 'number') return formatNumber(kpi.value)
  return kpi.value
}

export function KpiCard({ kpi, index }) {
  const Icon = Icons[kpi.icon] || Icons.Circle
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
    >
      <Card className="p-6" data-testid={`kpi-card-${kpi.id}`}>
        <div className="mb-5 flex items-start justify-between">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', toneStyles[kpi.tone])}>
            <Icon className="h-6 w-6" strokeWidth={2} />
          </div>
          <span className="text-right text-xs font-medium text-slate-400">{kpi.tag}</span>
        </div>
        <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
        <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900">
          {renderValue(kpi)}
        </p>
      </Card>
    </motion.div>
  )
}
