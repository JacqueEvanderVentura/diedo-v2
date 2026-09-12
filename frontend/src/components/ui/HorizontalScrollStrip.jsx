import { useRef } from 'react'
import { useHorizontalScrollStrip } from '@/hooks/useHorizontalWheelScroll'
import { cn } from '@/lib/utils'

/**
 * Horizontal overflow row: hidden scrollbar, wheel → smooth scroll, click-drag.
 */
export function HorizontalScrollStrip({ className, children, testId }) {
  const scrollRef = useRef(null)
  useHorizontalScrollStrip(scrollRef)

  return (
    <div
      ref={scrollRef}
      data-testid={testId}
      className={cn(
        'min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth scrollbar-hide',
        className
      )}
    >
      {children}
    </div>
  )
}
