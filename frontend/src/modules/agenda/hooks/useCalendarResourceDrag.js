import { useCallback, useRef, useState } from 'react'

const DRAG_THRESHOLD_PX = 6

export function resolveCalendarDrop(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY)
  const cell = element?.closest('[data-calendar-resource]')
  if (!cell?.dataset.calendarResource) return null
  return {
    resourceId: cell.dataset.calendarResource,
    slot: cell.dataset.calendarSlot || null,
  }
}

export function useCalendarResourceDrag({ onMove, isDisabled = false }) {
  const originRef = useRef(null)
  const didDragRef = useRef(false)
  const [dragState, setDragState] = useState(null)
  const [hoverTarget, setHoverTarget] = useState(null)

  const startDrag = useCallback((event, appointment) => {
    if (isDisabled || event.button !== 0 || !appointment) return
    if (event.target.closest('[data-no-calendar-drag]')) return
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    originRef.current = {
      appointment,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
    }
    didDragRef.current = false
    target.setPointerCapture?.(event.pointerId)
  }, [isDisabled])

  const moveDrag = useCallback((event) => {
    const origin = originRef.current
    if (!origin) return
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    if (!didDragRef.current && (dx * dx + dy * dy) < DRAG_THRESHOLD_PX ** 2) return
    didDragRef.current = true
    event.preventDefault()
    setDragState({
      id: origin.appointment.id,
      resourceId: origin.appointment.cabinaId,
      time: origin.appointment.time,
      label: origin.appointment.customerName,
      width: origin.width,
      x: event.clientX,
      y: event.clientY,
    })
    setHoverTarget(resolveCalendarDrop(event.clientX, event.clientY))
  }, [])

  const endDrag = useCallback(async (event) => {
    const origin = originRef.current
    originRef.current = null
    event.currentTarget?.releasePointerCapture?.(event.pointerId)
    const hover = resolveCalendarDrop(event.clientX, event.clientY)
    setHoverTarget(null)
    setDragState(null)
    if (!origin || !didDragRef.current) return
    const resourceId = hover?.resourceId || null
    const time = hover?.slot || origin.appointment.time
    await onMove?.({
      appointment: origin.appointment,
      resourceId,
      time,
    })
  }, [onMove])

  const cancelDrag = useCallback(() => {
    originRef.current = null
    setDragState(null)
    setHoverTarget(null)
  }, [])

  const consumeChipClick = useCallback(() => {
    if (!didDragRef.current) return false
    didDragRef.current = false
    return true
  }, [])

  return {
    dragState,
    hoverTarget,
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
    consumeChipClick,
  }
}
