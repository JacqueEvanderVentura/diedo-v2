import { recallPublicSession } from '@/modules/portal/lib/publicSession'
import { normalizeDocumentId } from '@/modules/agenda/lib/selfBooking'

const ANON_KEY = 'diedo-slot-hold-token'

function fnv1aHex(input) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Stable hold token per branch + document so the same client keeps their reservation. */
export function holdTokenForIdentity({ branchId, docType, documentId }) {
  const normalized = normalizeDocumentId(documentId, docType)
  const material = `${branchId}:${docType || 'cedula'}:${normalized}`
  const digest = `${fnv1aHex(material)}${fnv1aHex([...material].reverse().join(''))}${fnv1aHex(normalized)}`
  return `id-${digest}`.slice(0, 64)
}

export function getSlotHoldToken() {
  if (typeof sessionStorage === 'undefined') return ''
  const session = recallPublicSession()
  if (session?.branchId && session?.documentId) {
    return holdTokenForIdentity(session)
  }
  let token = sessionStorage.getItem(ANON_KEY)
  if (!token || token.length < 8) {
    token = crypto.randomUUID()
    sessionStorage.setItem(ANON_KEY, token)
  }
  return token
}

export function slotHoldHeaders() {
  const token = getSlotHoldToken()
  return token ? { 'X-Slot-Hold-Token': token } : {}
}