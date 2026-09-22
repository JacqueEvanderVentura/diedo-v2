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

  const desiredTop = flip
    ? anchorRect.top - menuHeight - gap
    : anchorRect.bottom + gap
  const maxTop = Math.max(viewportPadding, vh - menuHeight - viewportPadding)
  const top = Math.min(Math.max(desiredTop, viewportPadding), maxTop)

  let desiredLeft

  if (align === 'end') {
    desiredLeft = anchorRect.right - menuWidth
  } else if (align === 'center') {
    desiredLeft = anchorRect.left + (anchorRect.width - menuWidth) / 2
  } else {
    desiredLeft = anchorRect.left
  }
  const maxLeft = Math.max(viewportPadding, vw - menuWidth - viewportPadding)
  const left = Math.min(Math.max(desiredLeft, viewportPadding), maxLeft)

  return { top, left, flip }
}
