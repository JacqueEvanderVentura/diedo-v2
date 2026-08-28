/** Shared motion presets — brief, consistent transitions app-wide. */

// Smooth, near-linear deceleration (no spring bounce).
export const EASE_SMOOTH = [0.45, 0, 0.55, 1]

const verticalOnly = (y) => ({
  initial: { opacity: 0, y, x: 0 },
  animate: { opacity: 1, y: 0, x: 0 },
})

// Full-page route enter: fade + subtle rise, vertical only.
export const routeTransition = {
  ...verticalOnly(6),
  transition: { duration: 0.26, ease: EASE_SMOOTH },
}

// Tab / panel enter: slightly shorter travel.
export const tabTransition = {
  ...verticalOnly(4),
  transition: { duration: 0.2, ease: EASE_SMOOTH },
}

export const modalBackdropTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: EASE_SMOOTH },
}

// Modal: vertical fade only (no scale — scale caused the “pop then settle” feel).
export const modalPanelTransition = {
  initial: { opacity: 0, y: 10, x: 0 },
  animate: { opacity: 1, y: 0, x: 0 },
  exit: { opacity: 0, y: 8, x: 0 },
  transition: { duration: 0.24, ease: EASE_SMOOTH },
}
