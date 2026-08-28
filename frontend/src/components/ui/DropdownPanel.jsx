import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useFloatingMenu } from '@/hooks/useFloatingMenu'
import { cn } from '@/lib/utils'

export function DropdownPanel({
  open,
  anchorRef,
  menuRef,
  placement = 'auto',
  align = 'start',
  width,
  estimatedHeight = 160,
  zIndex = 100,
  className,
  children,
  'data-testid': testId,
}) {
  const style = useFloatingMenu({
    open,
    anchorRef,
    menuRef,
    placement,
    align,
    width,
    estimatedHeight,
  })

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          data-testid={testId}
          data-dropdown-menu=""
          initial={{ opacity: 0, y: style.flip ? 4 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: style.flip ? 4 : -4 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            top: style.top,
            bottom: style.bottom,
            left: style.left,
            right: style.right,
            zIndex,
            width: width || undefined,
          }}
          className={cn(
            'overflow-hidden rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl',
            className
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
