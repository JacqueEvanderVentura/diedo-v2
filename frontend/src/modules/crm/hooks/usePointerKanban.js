import { useCallback, useState } from 'react'

const PIPELINE_BOARD_SELECTOR = '[data-testid="pipeline-board-vertical-scroll"]'

/** Column under pointer, including empty space below cards (full board height). */
function resolvePipelineStage(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY)
  const fromTarget = element?.closest('[data-pipeline-stage]')
  if (fromTarget?.dataset.pipelineStage) return fromTarget.dataset.pipelineStage

  const board = document.querySelector(PIPELINE_BOARD_SELECTOR)
  if (!board) return null

  const boardRect = board.getBoundingClientRect()
  if (
    clientY < boardRect.top
    || clientY > boardRect.bottom
    || clientX < boardRect.left
    || clientX > boardRect.right
  ) {
    return null
  }

  const columns = board.querySelectorAll('[data-pipeline-stage]')
  for (const column of columns) {
    const rect = column.getBoundingClientRect()
    if (clientX >= rect.left && clientX <= rect.right) {
      return column.dataset.pipelineStage
    }
  }

  return null
}

export function usePointerKanban({ onMove, isDisabled = false }) {
  const [dragState, setDragState] = useState(null)
  const [hoverStage, setHoverStage] = useState(null)

  const startDrag = useCallback((event, item) => {
    if (isDisabled || event.button !== 0) return
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    target.setPointerCapture?.(event.pointerId)
    setDragState({
      id: item.id,
      stage: item.stage,
      label: item.label,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
    })
    event.preventDefault()
  }, [isDisabled])

  const moveDrag = useCallback((event) => {
    if (!dragState) return
    setDragState((current) => ({ ...current, x: event.clientX, y: event.clientY }))
    setHoverStage(resolvePipelineStage(event.clientX, event.clientY))
  }, [dragState])

  const endDrag = useCallback(async (event) => {
    if (!dragState) return
    const nextStage = resolvePipelineStage(event.clientX, event.clientY)
    event.currentTarget?.releasePointerCapture?.(event.pointerId)
    setHoverStage(null)
    const current = dragState
    setDragState(null)
    if (nextStage && nextStage !== current.stage) {
      await onMove(current.id, nextStage)
    }
  }, [dragState, onMove])

  const cancelDrag = useCallback(() => {
    setDragState(null)
    setHoverStage(null)
  }, [])

  return {
    dragState,
    hoverStage,
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
  }
}
