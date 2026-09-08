import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Copy, Download, Paperclip, ZoomIn, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { modalBackdropTransition, modalPanelTransition } from '@/lib/motion'
import { cn } from '@/lib/utils'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i

export function isImageProof(proof, blob) {
  const type = blob?.type || proof?.contentType || ''
  if (type.startsWith('image/')) return true
  return IMAGE_EXT.test(proof?.name || '')
}

export async function copyImageBlob(blob) {
  if (!navigator.clipboard?.write) {
    throw new Error('El portapapeles no está disponible')
  }
  const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png'
  try {
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
    return
  } catch {
    /* fall through — some browsers only accept image/png */
  }

  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  const pngBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('No se pudo convertir la imagen'))), 'image/png')
  })
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
}

function ImageLightbox({ open, src, alt, onClose }) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
          <motion.div
            initial={modalBackdropTransition.initial}
            animate={modalBackdropTransition.animate}
            exit={modalBackdropTransition.exit}
            transition={modalBackdropTransition.transition}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80"
            aria-hidden="true"
          />
          <motion.div
            initial={modalPanelTransition.initial}
            animate={modalPanelTransition.animate}
            exit={modalPanelTransition.exit}
            transition={modalPanelTransition.transition}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-full max-w-full flex-col items-center"
          >
            <span id={titleId} className="sr-only">
              {alt || 'Vista ampliada del comprobante'}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista ampliada"
              className="absolute -top-2 right-0 z-10 flex h-9 w-9 -translate-y-full items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 sm:right-0"
              data-testid="proof-lightbox-close"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={src}
              alt={alt || 'Comprobante ampliado'}
              className="max-h-[min(92vh,920px)] max-w-[min(96vw,1100px)] object-contain"
              data-testid="proof-lightbox-image"
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/**
 * Inline proof preview (Kubo-style): object-fit contain, enlarge lightbox, copy + download.
 */
export function ProofImagePreview({ proof, loadProof, onDownload, className }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [blob, setBlob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const proofKey = [
    proof?.id,
    proof?.downloadUrl,
    proof?.name,
    proof?.contentType,
    proof instanceof Blob ? proof.size : null,
  ].join('|')

  useEffect(() => {
    let cancelled = false
    let objectUrl = null

    async function load() {
      setLoading(true)
      setError('')
      setPreviewUrl(null)
      setBlob(null)
      try {
        const nextBlob = proof instanceof Blob ? proof : await loadProof(proof)
        if (cancelled) return
        // POS proofs are almost always images; prefer preview even if MIME is missing/octet-stream.
        const canPreview = isImageProof(proof, nextBlob) || IMAGE_EXT.test(proof?.name || '')
        if (!canPreview) {
          setBlob(nextBlob)
          setLoading(false)
          return
        }
        objectUrl = URL.createObjectURL(nextBlob)
        setBlob(nextBlob)
        setPreviewUrl(objectUrl)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'No se pudo cargar el comprobante.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // proofKey captures the stable identity of the proof payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofKey, loadProof])

  const handleCopy = async () => {
    if (!blob) return
    setBusy('copy')
    try {
      await copyImageBlob(blob)
      toast.success('Imagen copiada al portapapeles')
    } catch (err) {
      toast.error(err?.message || 'No se pudo copiar la imagen')
    } finally {
      setBusy(null)
    }
  }

  const handleDownload = async () => {
    setBusy('download')
    try {
      await onDownload?.(proof)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div
        className={cn('flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400', className)}
        data-testid="proof-preview-loading"
      >
        Cargando vista previa del comprobante…
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900', className)} data-testid="proof-preview-error">
        <p className="font-medium">No se pudo mostrar la vista previa</p>
        <p className="text-amber-800/80">{error}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
            Descargar {proof?.name || 'comprobante'}
          </Button>
        </div>
      </div>
    )
  }

  if (!previewUrl) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700', className)} data-testid="proof-preview-file">
        <Paperclip className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          Archivo adjunto (sin vista previa): <span className="font-semibold">{proof?.name || 'archivo'}</span>
        </span>
        <button
          type="button"
          onClick={handleDownload}
          disabled={Boolean(busy)}
          className="shrink-0 rounded-lg p-2 hover:bg-slate-200 disabled:opacity-50"
          title="Descargar comprobante"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)} data-testid="proof-image-preview">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="group block w-full cursor-zoom-in text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          data-testid="proof-preview-open"
          title="Ampliar comprobante"
        >
          <img
            src={previewUrl}
            alt={proof?.name || 'Comprobante adjunto'}
            className="mx-auto max-h-72 min-h-40 w-full object-contain p-3 transition-opacity group-hover:opacity-95"
            onError={() => {
              setPreviewUrl(null)
              setError('El archivo no se pudo renderizar como imagen.')
            }}
          />
        </button>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur hover:bg-slate-900"
          data-testid="proof-preview-enlarge"
        >
          <ZoomIn className="h-3.5 w-3.5" />
          Ampliar
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-slate-500" title={proof?.name}>
          {proof?.name || 'Comprobante'}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            disabled={Boolean(busy)}
            data-testid="proof-preview-copy"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleDownload}
            disabled={Boolean(busy)}
            data-testid="proof-preview-download"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar
          </Button>
        </div>
      </div>

      <ImageLightbox
        open={lightboxOpen}
        src={previewUrl}
        alt={proof?.name || 'Comprobante adjunto'}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  )
}

export default ProofImagePreview
