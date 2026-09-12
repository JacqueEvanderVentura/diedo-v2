import { useEffect } from 'react'

const DRAG_THRESHOLD_PX = 5

function canScrollHorizontally(element) {
  return element.scrollWidth > element.clientWidth + 1
}

/**
 * Horizontal strip: wheel (Y→X, smooth), optional click-drag, hidden scrollbar via parent classes.
 * @param {{ enableDrag?: boolean }} [options]
 */
export function useHorizontalScrollStrip(ref, options = {}) {
  const { enableDrag = true } = options

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined

    let drag = null

    const onWheel = (event) => {
      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY
      if (delta === 0) return
      if (!canScrollHorizontally(element)) return

      const maxScroll = element.scrollWidth - element.clientWidth
      const atStart = element.scrollLeft <= 0
      const atEnd = element.scrollLeft >= maxScroll - 1
      const scrollingForward = delta > 0
      const scrollingBack = delta < 0

      if ((scrollingForward && atEnd) || (scrollingBack && atStart)) return

      event.preventDefault()
      const next = Math.min(maxScroll, Math.max(0, element.scrollLeft + delta))
      element.scrollTo({ left: next, behavior: 'smooth' })
    }

    const onPointerDown = (event) => {
      if (!enableDrag) return
      if (event.button !== 0) return
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScroll: element.scrollLeft,
        dragging: false,
      }
      element.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      const deltaX = event.clientX - drag.startX
      if (!drag.dragging) {
        if (Math.abs(deltaX) < DRAG_THRESHOLD_PX) return
        drag.dragging = true
        element.classList.add('cursor-grabbing', 'select-none')
        element.classList.remove('cursor-grab')
      }
      event.preventDefault()
      element.scrollLeft = drag.startScroll - deltaX
    }

    const endDrag = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      const wasDragging = drag.dragging
      try {
        element.releasePointerCapture(event.pointerId)
      } catch {
        // Pointer may already be released.
      }
      drag = null
      element.classList.remove('cursor-grabbing', 'select-none')
      if (canScrollHorizontally(element)) {
        element.classList.add('cursor-grab')
      }
      if (wasDragging) {
        const suppressClick = (clickEvent) => {
          clickEvent.preventDefault()
          clickEvent.stopImmediatePropagation()
          element.removeEventListener('click', suppressClick, true)
        }
        element.addEventListener('click', suppressClick, true)
      }
    }

    const syncCursor = () => {
      if (canScrollHorizontally(element)) {
        element.classList.add('cursor-grab')
      } else {
        element.classList.remove('cursor-grab')
      }
    }

    const resizeObserver =
      enableDrag && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncCursor) : null
    if (enableDrag) {
      syncCursor()
      resizeObserver?.observe(element)
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    if (enableDrag) {
      element.addEventListener('pointerdown', onPointerDown)
      element.addEventListener('pointermove', onPointerMove)
      element.addEventListener('pointerup', endDrag)
      element.addEventListener('pointercancel', endDrag)
    }

    return () => {
      resizeObserver?.disconnect()
      element.removeEventListener('wheel', onWheel)
      if (enableDrag) {
        element.removeEventListener('pointerdown', onPointerDown)
        element.removeEventListener('pointermove', onPointerMove)
        element.removeEventListener('pointerup', endDrag)
        element.removeEventListener('pointercancel', endDrag)
      }
      element.classList.remove('cursor-grab', 'cursor-grabbing', 'select-none')
    }
  }, [ref, enableDrag])
}

/** @deprecated Use useHorizontalScrollStrip */
export const useHorizontalWheelScroll = useHorizontalScrollStrip
