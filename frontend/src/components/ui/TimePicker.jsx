import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Clock } from 'lucide-react'
import { timeSlots, formatTime12h } from '@/modules/agenda/lib/calendar'
import { cn } from '@/lib/utils'

export function TimePicker({
  value,
  onChange,
  slots = null,
  emptyMessage = 'No hay horarios disponibles.',
  className,
  testId = 'time-picker',
  placeholder = 'Seleccionar hora',
  label,
  disabled = false,
}) {
  const options = slots ?? timeSlots(8, 20, 30)
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0 })
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const selectedLabel = value ? formatTime12h(value) : null

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.max(rect.width, 220)
    const menuHeight = menuRef.current?.getBoundingClientRect().height || 208
    const gap = 8
    const fitsBelow = rect.bottom + gap + menuHeight <= window.innerHeight - 8
    setMenuStyle({
      left: rect.left,
      width,
      top: fitsBelow ? rect.bottom + gap : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - rect.top + gap,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    requestAnimationFrame(updatePosition)
  }, [open, options.length])

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
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (slot) => {
    onChange?.(slot)
    setOpen(false)
  }

  if (options.length === 0) {
    return (
      <p
        className={cn('rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500', className)}
        data-testid={`${testId}-empty`}
      >
        {emptyMessage}
      </p>
    )
  }

  const menu = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          role="listbox"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            top: menuStyle.top,
            bottom: menuStyle.bottom,
            left: menuStyle.left,
            width: menuStyle.width,
            zIndex: 100,
          }}
          className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl"
          data-testid={`${testId}-menu`}
        >
          <ul className="max-h-52 overflow-y-auto p-1.5 scrollbar-thin">
            {options.map((slot) => {
              const active = value === slot
              return (
                <li key={slot} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-testid={`${testId}-slot-${slot}`}
                    onClick={() => pick(slot)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                      active
                        ? 'bg-blue-50 font-semibold text-blue-700'
                        : 'font-medium text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <Check
                      className={cn('h-4 w-4 shrink-0 text-blue-600', active ? 'opacity-100' : 'opacity-0')}
                      aria-hidden
                    />
                    <span className="tabular-nums">{formatTime12h(slot)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {label ? <p className="mb-1.5 text-sm font-medium text-slate-600">{label}</p> : null}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        data-testid={`${testId}-select`}
        onClick={() => !disabled && setOpen((current) => !current)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm transition-[border-color,box-shadow]',
          'hover:border-blue-200 hover:shadow-md',
          'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100',
          'disabled:cursor-not-allowed disabled:opacity-50',
          selectedLabel ? 'font-semibold text-slate-800' : 'font-medium text-slate-400',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">{selectedLabel || placeholder}</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {typeof document !== 'undefined' && createPortal(menu, document.body)}
    </div>
  )
}
