import { cn } from '@/lib/utils'
import { formatDOP } from '@/lib/format'

const STAGE_HEADER_CLASS = 'w-72 shrink-0 px-1'

/** Stage labels row — lives inside the pipeline horizontal scroll so it moves with columns. */
export function PipelineStageHeaders({ stages, stageMeta, byStage, className }) {
  return (
    <div
      className={cn('flex shrink-0 gap-4 border-b border-slate-100/90 pb-2 pt-1', className)}
      data-testid="pipeline-stage-headers"
    >
      {stages.map((stage) => {
        const meta = stageMeta[stage]
        const deals = byStage[stage] || []
        const stageValue = deals.reduce((total, row) => total + (row.value || 0), 0)
        return (
          <div key={stage} className={STAGE_HEADER_CLASS} data-pipeline-stage-header={stage}>
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', meta.color)} />
              <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{deals.length}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{formatDOP(stageValue)}</p>
          </div>
        )
      })}
    </div>
  )
}

export const PIPELINE_COLUMN_WIDTH_CLASS = STAGE_HEADER_CLASS
