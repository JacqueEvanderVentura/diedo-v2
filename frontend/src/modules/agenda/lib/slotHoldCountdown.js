export function formatHoldCountdown(expiresAt, nowMs = Date.now()) {
  const end = new Date(expiresAt).getTime()
  const diff = Math.max(0, Math.floor((end - nowMs) / 1000))
  const minutes = Math.floor(diff / 60)
  const seconds = diff % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function holdRemainingMs(expiresAt, nowMs = Date.now()) {
  return Math.max(0, new Date(expiresAt).getTime() - nowMs)
}