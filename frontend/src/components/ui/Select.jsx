import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeFloatingPosition } from '@/lib/floatingPosition'

const sizes = {
  sm: 'py-2 pl-3 pr-9 text-sm',
  md: 'py-3 pl-4 pr-10 text-sm',
}

function normalizeOptions(options) {
  return options.map((opt) =>
    typeof opt === 'object' && opt !== null && 'value' in opt
      ? { value: String(opt.value), label: opt.label, disabled: !!opt.disabled }
      : { value: String(opt.id ?? opt.value), label: opt.label ?? opt.name, disabled: !!opt.disabled }
  )
}

export function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Seleccionar…',
  disabled = false,
  className,
  triggerClassName,
  size = 'md',
  variant = 'default',
  menuMinWidth,
  placement = 'auto',
  'data-testid': testId,
}) {
  const listId = useId()
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState({ top: undefined, bottom: undefined, left: undefined, right: undefined, width: 0, flip: false })

  const items = normalizeOptions(options)
  const strValue = value === undefined || value === null ? '' : String(value)
  const selected = items.find((o) => o.value === strValue)

  const updatePosition = () => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = menuMinWidth ? Math.max(rect.width, menuMinWidth) : rect.width
    const gap = 6
    const estimatedHeight = Math.min(items.length * 44 + 12, 240)
    const menuHeight = menuRef.current?.getBoundingClientRect().height || estimatedHeight
    const next = computeFloatingPosition({
      anchorRect: rect,
      menuWidth: width,
      menuHeight,
      gap,
      placement,
      align: 'start',
    })
    setMenuStyle({ ...next, width })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    requestAnimationFrame(updatePosition)
  }, [open, items.length, placement])

  useEffect(() => {
    if (!open) return
    const onScroll = () => updatePosition()
    const onResize = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, items.length, placement])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target)) return
      if (e.target.closest?.('[data-select-menu]')) return
      if (e.target.closest?.('[data-dropdown-menu]')) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (next) => {
    if (next.disabled) return
    onChange?.(next.value)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        data-testid={testId}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between rounded-xl border-0 text-left font-medium text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition-shadow focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50',
          variant === 'muted' ? 'bg-slate-50 font-semibold' : 'bg-white',
          sizes[size],
          !selected && 'text-slate-400',
          triggerClassName
        )}
      >
        <span className="min-w-0 flex-1 truncate pr-2">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.ul
                ref={menuRef}
                id={listId}
                role="listbox"
                data-select-menu
                initial={{ opacity: 0, y: menuStyle.flip ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: menuStyle.flip ? 4 : -4 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'fixed',
                  top: menuStyle.top,
                  bottom: menuStyle.bottom,
                  left: menuStyle.left,
                  width: menuStyle.width,
                  zIndex: 100,
                }}
                className="max-h-60 overflow-y-auto rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl scrollbar-thin"
              >
                {items.map((opt) => {
                  const active = opt.value === strValue
                  return (
                    <li key={opt.value} role="option" aria-selected={active}>
                      <button
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => pick(opt)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                          active
                            ? 'bg-blue-50 font-semibold text-blue-700'
                            : 'font-medium text-slate-700 hover:bg-slate-50',
                          opt.disabled && 'cursor-not-allowed opacity-40'
                        )}
                      >
                        <span className="whitespace-normal leading-snug">{opt.label}</span>
                        {active && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                      </button>
                    </li>
                  )
                })}
              </motion.ul>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}
