import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { computeFloatingPosition } from '@/lib/floatingPosition'
import { cn } from '@/lib/utils'

const placementForSide = {
  top: 'top',
  bottom: 'bottom',
  left: 'top',
  right: 'top',
}

const alignForSide = {
  top: 'center',
  bottom: 'center',
  left: 'end',
  right: 'start',
}

/**
 * Rich hover/focus tooltip — rendered in a portal so it is not clipped by overflow containers.
 */
export function Tip({
  children,
  title,
  body,
  side = 'top',
  className,
  wide = false,
  align,
}) {
  const anchorRef = useRef(null)
  const tipRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)

  const resolvedAlign = align ?? alignForSide[side] ?? 'center'
  const resolvedPlacement = placementForSide[side] ?? 'top'

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    const tip = tipRef.current?.getBoundingClientRect()
    if (!anchor || !tip?.width) return

    const pos = computeFloatingPosition({
      anchorRect: anchor,
      menuWidth: tip.width,
      menuHeight: tip.height,
      gap: 8,
      placement: resolvedPlacement,
      align: resolvedAlign,
    })

    setCoords({
      position: 'fixed',
      top: pos.top,
      bottom: pos.bottom,
      left: pos.left,
      right: pos.right,
      zIndex: 9999,
    })
  }, [resolvedAlign, resolvedPlacement])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition, title, body])

  const showTip = open && typeof document !== 'undefined'

  return (
    <>
      <span
        ref={anchorRef}
        className={cn('inline-flex', className)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
        }}
      >
        {children}
      </span>

      {showTip &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={
              coords || {
                position: 'fixed',
                top: -9999,
                left: -9999,
                visibility: 'hidden',
                zIndex: 9999,
              }
            }
            className={cn(
              'pointer-events-none w-max max-w-[min(240px,calc(100vw-16px))] transition-opacity duration-150',
              wide && 'max-w-[min(280px,calc(100vw-16px))]',
              coords ? 'opacity-100' : 'opacity-0'
            )}
          >
            <span className="block rounded-xl bg-slate-900 px-3.5 py-2.5 shadow-xl shadow-slate-900/25 ring-1 ring-white/10">
              <span className="block text-xs font-semibold leading-snug text-white">{title}</span>
              {body && (
                <span className="mt-1 block text-[11px] leading-relaxed text-slate-300">{body}</span>
              )}
            </span>
          </span>,
          document.body
        )}
    </>
  )
}
