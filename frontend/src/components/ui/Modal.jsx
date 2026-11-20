import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { modalBackdropTransition, modalPanelTransition } from '@/lib/motion'
import { cn } from '@/lib/utils'

export const MODAL_LAYER_Z = {
  default: 80,
  elevated: 100,
  nested: 120,
}

export function modalLayerRank({ nested = false, elevated = false } = {}) {
  if (nested) return MODAL_LAYER_Z.nested
  if (elevated) return MODAL_LAYER_Z.elevated
  return MODAL_LAYER_Z.default
}

export function modalLayerClass(options) {
  const rank = modalLayerRank(options)
  if (rank === MODAL_LAYER_Z.nested) return 'z-[120]'
  if (rank === MODAL_LAYER_Z.elevated) return 'z-[100]'
  return 'z-[80]'
}

const openModals = []
let escapeBound = false

function onEscapeKey(event) {
  if (event.key !== 'Escape' || !openModals.length) return
  const top = openModals.reduce((best, entry) => (
    entry.rank >= best.rank ? entry : best
  ))
  event.preventDefault()
  event.stopImmediatePropagation()
  top.onClose?.()
}

function registerOpenModal(entry) {
  openModals.push(entry)
  if (!escapeBound) {
    document.addEventListener('keydown', onEscapeKey, true)
    escapeBound = true
  }
}

function unregisterOpenModal(entry) {
  const index = openModals.indexOf(entry)
  if (index >= 0) openModals.splice(index, 1)
  if (!openModals.length && escapeBound) {
    document.removeEventListener('keydown', onEscapeKey, true)
    escapeBound = false
  }
}

export function Modal({
  open,
  onClose,
  title,
  children,
  testId,
  wide = false,
  xlarge = false,
  bodyClassName,
  elevated = false,
  nested = false,
}) {
  const titleId = useId()
  const rank = modalLayerRank({ nested, elevated })
  const layer = nested ? 'nested' : elevated ? 'elevated' : 'default'

  useEffect(() => {
    if (!open) return
    const entry = { onClose, rank }
    registerOpenModal(entry)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      unregisterOpenModal(entry)
      document.body.style.overflow = prev
    }
  }, [open, onClose, rank])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={cn(
            'fixed inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center',
            modalLayerClass({ nested, elevated }),
          )}
          data-modal-layer={layer}
        >
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
