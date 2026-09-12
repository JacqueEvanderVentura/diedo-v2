import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

function readMetrics(element) {
  return {
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }
}

/**
 * Visible horizontal scrollbar synced to a scrollable element (wheel users, no trackpad).
 */
export function HorizontalScrollRail({
  scrollRef,
  className,
  hint,
  showHint = false,
  testId = 'horizontal-scroll-rail',
}) {
  const trackRef = useRef(null)
  const [metrics, setMetrics] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 })
  const dragRef = useRef(null)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return undefined

    const update = () => setMetrics(readMetrics(element))
    update()
    element.addEventListener('scroll', update, { passive: true })
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    resizeObserver?.observe(element)

    return () => {
      element.removeEventListener('scroll', update)
      resizeObserver?.disconnect()
    }
  }, [scrollRef])

  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth)
  const canScroll = maxScroll > 1
  const thumbRatio = canScroll ? metrics.clientWidth / metrics.scrollWidth : 1
  const thumbWidthPct = thumbRatio * 100
  const scrollRatio = canScroll ? metrics.scrollLeft / maxScroll : 0
  const thumbLeftPct = scrollRatio * (100 - thumbWidthPct)

  const setScrollFromClientX = useCallback(
    (clientX, mode = 'jump') => {
      const element = scrollRef.current
      const track = trackRef.current
      if (!element || !track || !canScroll) return

      const rect = track.getBoundingClientRect()
      const trackPad = 4
      const innerWidth = Math.max(1, rect.width - trackPad * 2)
      const x = Math.min(rect.width - trackPad, Math.max(trackPad, clientX - rect.left)) - trackPad
      const ratio = x / innerWidth

      if (mode === 'jump') {
        element.scrollLeft = ratio * maxScroll
        return
      }

      const drag = dragRef.current
      if (!drag) return
      const thumbTravel = innerWidth * (1 - thumbRatio)
      const deltaPx = clientX - drag.startX
      const deltaScroll = thumbTravel > 0 ? (deltaPx / thumbTravel) * maxScroll : 0
      element.scrollLeft = Math.min(maxScroll, Math.max(0, drag.startScroll + deltaScroll))
    },
    [canScroll, maxScroll, scrollRef, thumbRatio],
  )

  const onTrackPointerDown = (event) => {
    if (!canScroll || event.button !== 0) return
    const target = event.target
    if (target?.dataset?.scrollThumb === '1') return
    setScrollFromClientX(event.clientX, 'jump')
  }

  const onThumbPointerDown = (event) => {
    if (!canScroll || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: scrollRef.current?.scrollLeft ?? 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onThumbPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    setScrollFromClientX(event.clientX, 'drag')
  }

  const endThumbDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // already released
    }
  }

  if (!canScroll) return null

  const hintText = hint !== undefined ? hint : showHint ? 'Arrastra la barra para moverte entre columnas' : null

  return (
    <div className={cn('shrink-0 px-1 pt-2', className)} data-testid={testId}>
      <div
        ref={trackRef}
        role="scrollbar"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={maxScroll}
        aria-valuenow={metrics.scrollLeft}
        className="group relative h-3.5 cursor-pointer rounded-full bg-slate-100 ring-1 ring-slate-200/90 shadow-inner transition-colors hover:bg-slate-50"
        onPointerDown={onTrackPointerDown}
      >
        <div
          data-scroll-thumb="1"
          className="absolute top-0.5 h-2 min-w-[2.5rem] rounded-full bg-gradient-to-b from-slate-400 to-slate-500 shadow-sm ring-1 ring-white/60 transition-[background,box-shadow] group-hover:from-slate-500 group-hover:to-slate-600 active:from-slate-600 active:to-slate-700"
          style={{
            width: `calc(${thumbWidthPct}% - 4px)`,
            left: `calc(${thumbLeftPct}% + 2px)`,
          }}
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={endThumbDrag}
          onPointerCancel={endThumbDrag}
        />
      </div>
      {hintText ? (
        <p className="mt-1.5 text-center text-[10px] leading-snug text-slate-400">{hintText}</p>
      ) : null}
    </div>
  )
}
