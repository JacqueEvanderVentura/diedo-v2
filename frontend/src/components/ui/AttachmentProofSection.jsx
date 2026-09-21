import { ProofImagePreview } from '@/modules/pos/components/ProofImagePreview'
import { attachmentTypeLabel, formatAttachmentSizeFromItem } from '@/lib/attachmentMeta'
import { cn } from '@/lib/utils'

export function AttachmentProofSection({
  title,
  subtitle,
  items = [],
  loadProof,
  onDownload,
  className,
  testId,
}) {
  if (!items.length) return null

  return (
    <div className={cn('space-y-4', className)} data-testid={testId}>
      {(title || subtitle) && (
        <div>
          {title && (
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
          )}
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
      )}
      {items.map((item, index) => {
        const typeLabel = attachmentTypeLabel(item)
        const sizeLabel = formatAttachmentSizeFromItem(item)
        const meta = [typeLabel, sizeLabel].filter(Boolean).join(' · ')
        return (
          <div key={item.id || item.downloadUrl || `${index}-${item.name}`} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-800" title={item.name}>
                {item.name || 'Comprobante'}
              </p>
              {meta && <p className="text-xs font-medium text-slate-400">{meta}</p>}
            </div>
            <ProofImagePreview
              proof={item}
              loadProof={loadProof}
              onDownload={onDownload}
            />
          </div>
        )
      })}
    </div>
  )
}
