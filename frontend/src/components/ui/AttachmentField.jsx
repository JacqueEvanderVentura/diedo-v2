import { useRef, useState } from 'react'
import { ImagePlus, X, ZoomIn } from 'lucide-react'
import { ImageLightbox } from '@/modules/pos/components/ProofImagePreview'
import { Button } from '@/components/ui/Button'
import { filesToAttachments } from '@/lib/imageAttachments'

const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf'

export function AttachmentField({
  value = [],
  onChange,
  disabled = false,
  testId = 'attachment-field',
  label = 'Comprobantes / fotos',
  emptyText = 'Sin comprobantes adjuntos',
  helpText,
  multiple = true,
  maxFiles,
  accept = DEFAULT_ACCEPT,
}) {
  const fileRef = useRef(null)
  const [lightbox, setLightbox] = useState(null)
  const [loading, setLoading] = useState(false)
  const labelId = `${testId}-label`
  const helpId = helpText ? `${testId}-help` : undefined
  const items = value || []
  const atLimit = Number.isFinite(maxFiles) && items.length >= maxFiles
  const replaceMode = atLimit || multiple === false
  const addLabel = replaceMode && items.length ? 'Reemplazar' : 'Agregar'
  const addAria = replaceMode && items.length ? `Reemplazar ${label.toLowerCase()}` : `Agregar ${label.toLowerCase()}`

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    setLoading(true)
    try {
      const next = await filesToAttachments(replaceMode || multiple === false ? files.slice(0, 1) : files)
      if (replaceMode || multiple === false) onChange(next)
      else if (Number.isFinite(maxFiles)) onChange([...items, ...next].slice(0, maxFiles))
      else onChange([...items, ...next])
    } finally {
      setLoading(false)
    }
  }

  const removeAt = (index) => {
    onChange(items.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <>
      <div data-testid={testId}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label id={labelId} htmlFor={`${testId}-input`} className="text-sm font-medium text-slate-600">
            {label}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || loading}
            onClick={() => fileRef.current?.click()}
            aria-label={addAria}
            data-testid={`${testId}-add`}
          >
            <ImagePlus className="h-4 w-4" />
            {loading ? 'Cargando…' : addLabel}
          </Button>
          <input
            id={`${testId}-input`}
            ref={fileRef}
            type="file"
            accept={accept}
            multiple={multiple !== false && !replaceMode}
            className="hidden"
            aria-labelledby={labelId}
            aria-describedby={helpId}
            onChange={handleFiles}
          />
        </div>
        {helpText && (
          <p id={helpId} className="mb-2 text-xs text-slate-500">{helpText}</p>
        )}
        {items.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((attachment, index) => {
              const src = attachment.previewObjectUrl || attachment.dataUrl
              const isImage = (attachment.contentType || '').startsWith('image/') || String(src).startsWith('data:image')
              return (
                <div key={attachment.id || `${index}-${attachment.name}`} className="group relative">
                  {isImage ? (
                    <button
                      type="button"
                      onClick={() => setLightbox({ src, name: attachment.name })}
                      className="relative aspect-square w-full overflow-hidden rounded-lg border border-slate-100 bg-slate-50"
                      data-testid={`${testId}-preview-${index}`}
                    >
                      <img src={src} alt={attachment.name} className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 transition-colors group-hover:bg-slate-900/35">
                        <ZoomIn className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </button>
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-3 text-center text-xs font-medium text-slate-600">
                      {attachment.name}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Quitar ${attachment.name}`}
                    onClick={() => removeAt(index)}
                    disabled={disabled}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-5 text-sm text-slate-400">
            {emptyText}
          </p>
        )}
      </div>
      <ImageLightbox
        open={Boolean(lightbox)}
        src={lightbox?.src}
        alt={lightbox?.name}
        onClose={() => setLightbox(null)}
      />
    </>
  )
}
