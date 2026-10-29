import { useCallback, useRef, useState } from 'react'

const DRAG_THRESHOLD_PX = 6
const CARD_TOP_PROBE_PX = 4

function elementsAtPoint(clientX, clientY) {
  if (typeof document.elementsFromPoint === 'function') {
    return document.elementsFromPoint(clientX, clientY) || []
  }
  const element = document.elementFromPoint(clientX, clientY)
  return element ? [element] : []
}

/** Chips overflow their start cell, so prefer the slot cell physically under the point over `closest()`. */
export function resolveCalendarDrop(clientX, clientY) {
  const elements = elementsAtPoint(clientX, clientY)
  const slotCell = elements.find((element) => element?.dataset?.calendarSlot && element.dataset.calendarResource)
  const cell = slotCell || elements[0]?.closest?.('[data-calendar-resource]')
  if (!cell?.dataset.calendarResource) return null
  return {
    resourceId: cell.dataset.calendarResource,
    slot: cell.dataset.calendarSlot || null,
  }
}

/** Target slot follows the card's top edge, not the pointer, so grabbing a long card low does not shift its time. */
export function resolveCalendarDropForCard(clientX, clientY, grabOffsetY = 0) {
  const cardTop = resolveCalendarDrop(clientX, clientY - grabOffsetY + CARD_TOP_PROBE_PX)
  if (cardTop?.slot) return cardTop
  return resolveCalendarDrop(clientX, clientY)
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
      grabOffsetY: Math.max(0, event.clientY - rect.top),
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
      grabOffsetY: origin.grabOffsetY,
      x: event.clientX,
      y: event.clientY,
    })
    setHoverTarget(resolveCalendarDropForCard(event.clientX, event.clientY, origin.grabOffsetY))
  }, [])

  const endDrag = useCallback(async (event) => {
    const origin = originRef.current
    originRef.current = null
    event.currentTarget?.releasePointerCapture?.(event.pointerId)
    const hover = origin
      ? resolveCalendarDropForCard(event.clientX, event.clientY, origin.grabOffsetY)
      : null
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
