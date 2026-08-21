import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { CartPanel } from './CartPanel'

// Mobile: cart as a bottom sheet drawer.
export function CartDrawer() {
  const open = usePosStore((s) => s.cartDrawerOpen)
  const close = usePosStore((s) => s.closeCartDrawer)

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            data-testid="pos-cart-drawer"
            className="absolute inset-x-0 bottom-0 top-16 overflow-hidden rounded-t-3xl bg-white"
          >
            <button
              onClick={close}
              data-testid="pos-cart-drawer-close"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
            <CartPanel onCheckoutDone={close} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
