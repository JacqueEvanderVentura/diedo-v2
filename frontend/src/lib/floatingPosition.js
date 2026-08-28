const DEFAULT_GAP = 6
const VIEWPORT_PADDING = 8

/**
 * Computes fixed positioning for a floating menu relative to an anchor rect.
 * Automatically flips above the anchor when there isn't enough space below.
 */
export function computeFloatingPosition({
  anchorRect,
  menuWidth,
  menuHeight,
  gap = DEFAULT_GAP,
  placement = 'auto',
  align = 'start',
  viewportPadding = VIEWPORT_PADDING,
}) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const spaceBelow = vh - anchorRect.bottom
  const spaceAbove = anchorRect.top
  const required = menuHeight + gap

  let flip = placement === 'top'
  if (placement === 'auto') {
    const fitsBelow = spaceBelow >= required
    const fitsAbove = spaceAbove >= required
    if (!fitsBelow && fitsAbove) flip = true
    else if (!fitsBelow && !fitsAbove) flip = spaceAbove > spaceBelow
  } else if (placement === 'bottom') {
    flip = false
  }

  let top
  let bottom
  let left
  let right

  if (flip) {
    bottom = vh - anchorRect.top + gap
  } else {
    top = anchorRect.bottom + gap
  }

  if (align === 'end') {
    right = vw - anchorRect.right
    const overflowLeft = anchorRect.right - menuWidth
    if (overflowLeft < viewportPadding) {
      right = undefined
      left = Math.max(viewportPadding, vw - menuWidth - viewportPadding)
    }
  } else if (align === 'center') {
    left = anchorRect.left + (anchorRect.width - menuWidth) / 2
    left = Math.min(Math.max(left, viewportPadding), vw - menuWidth - viewportPadding)
  } else {
    left = anchorRect.left
    if (left + menuWidth > vw - viewportPadding) {
      left = Math.max(viewportPadding, vw - menuWidth - viewportPadding)
    }
  }

  return { top, bottom, left, right, flip }
}
