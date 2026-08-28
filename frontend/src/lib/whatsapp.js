/** Normalize phone to wa.me digits (DR: 809/829/849 → prefix 1). */
export function digitsOnly(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10 && /^[89]/.test(digits)) return `1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return digits
  return digits
}

/** Replace {{var}} placeholders in template body. */
export function fillTemplate(body, vars = {}) {
  return String(body).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key]
    return val != null && val !== '' ? String(val) : `{{${key}}}`
  })
}

/** Build wa.me URL with optional pre-filled message (uses `text=` per WhatsApp docs). */
export function waMeUrl(phone, text) {
  const digits = digitsOnly(phone)
  if (!digits) return null
  const base = `https://wa.me/${digits}`
  if (!text) return base
  return `${base}?text=${encodeURIComponent(text)}`
}
