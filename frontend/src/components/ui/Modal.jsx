import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { modalBackdropTransition, modalPanelTransition } from '@/lib/motion'
import { cn } from '@/lib/utils'

export function Modal({ open, onClose, title, children, testId, wide = false, xlarge = false, bodyClassName }) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
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
        <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto p-4 sm:items-center">
          <motion.div
            initial={modalBackdropTransition.initial}
            animate={modalBackdropTransition.animate}
            exit={modalBackdropTransition.exit}
            transition={modalBackdropTransition.transition}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault()
                onClose?.()
              }
            }}
          />
          <motion.div
            initial={modalPanelTransition.initial}
            animate={modalPanelTransition.animate}
            exit={modalPanelTransition.exit}
            transition={modalPanelTransition.transition}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid={testId}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'relative z-10 flex max-h-[min(90dvh,calc(100vh-2rem))] w-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl',
              xlarge ? 'max-w-4xl' : wide ? 'max-w-2xl' : 'max-w-md'
            )}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-5">
              <div id={titleId} className="min-w-0 text-lg font-semibold tracking-tight text-slate-900">{title}</div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar modal"
                data-testid="modal-close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              className={cn(
                'min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 scrollbar-thin',
                bodyClassName,
              )}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
