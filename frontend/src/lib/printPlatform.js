/** True on iOS/iPadOS and desktop Safari (WebKit print/PDF quirks). */
export function prefersPdfOpenInNewTab() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS/i.test(ua)
  return isIOS || isSafari
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
