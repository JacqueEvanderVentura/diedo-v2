import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { computeFloatingPosition } from '@/lib/floatingPosition'

export function useFloatingMenu({
  open,
  anchorRef,
  menuRef,
  placement = 'auto',
  align = 'start',
  gap = 6,
  width,
  estimatedHeight = 160,
}) {
  const [style, setStyle] = useState({
    top: undefined,
    left: undefined,
    flip: false,
  })

  const update = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    if (!anchor) return
    const measured = menuRef.current?.getBoundingClientRect()
    const menuHeight = measured?.height || estimatedHeight
    const menuWidth = width ?? measured?.width ?? anchor.width
    setStyle(
      computeFloatingPosition({
        anchorRect: anchor,
        menuWidth,
        menuHeight,
        gap,
        placement,
        align,
      })
    )
  }, [anchorRef, menuRef, placement, align, gap, width, estimatedHeight])

  useLayoutEffect(() => {
    if (!open) return
    update()
    const id = requestAnimationFrame(update)
    return () => cancelAnimationFrame(id)
  }, [open, update])

  useEffect(() => {
    if (!open) return
    const onScroll = () => update()
    const onResize = () => update()
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onResize)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    if (anchorRef.current) observer?.observe(anchorRef.current)
    if (menuRef.current) observer?.observe(menuRef.current)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
    }
  }, [anchorRef, menuRef, open, update])

  return style
}
