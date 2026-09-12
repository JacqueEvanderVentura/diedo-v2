import { useRef, useState } from 'react'
import { ImagePlus, X, ZoomIn } from 'lucide-react'
import { ImageLightbox } from '@/modules/pos/components/ProofImagePreview'
import { Button } from '@/components/ui/Button'
import { filesToAttachments } from '@/lib/imageAttachments'

export function AttachmentField({ value = [], onChange, disabled = false, testId = 'attachment-field' }) {
  const fileRef = useRef(null)
  const [lightbox, setLightbox] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    setLoading(true)
    try {
      const next = await filesToAttachments(files)
      onChange([...(value || []), ...next])
    } finally {
      setLoading(false)
    }
  }

  const removeAt = (index) => {
    onChange((value || []).filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <>
      <div data-testid={testId}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-slate-600">Comprobantes / fotos</label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || loading}
            onClick={() => fileRef.current?.click()}
            data-testid={`${testId}-add`}
          >
            <ImagePlus className="h-4 w-4" />
            {loading ? 'Cargando…' : 'Agregar'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
        </div>
        {(value || []).length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(value || []).map((attachment, index) => {
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
            Sin comprobantes adjuntos
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
