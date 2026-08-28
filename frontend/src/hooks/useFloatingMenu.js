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
    bottom: undefined,
    left: undefined,
    right: undefined,
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
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, update])

  return style
}
