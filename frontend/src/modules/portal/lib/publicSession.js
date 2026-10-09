import { ephemeralStorage } from '@/services/storagePolicy'
import { normalizeDocumentId } from '@/modules/agenda/lib/selfBooking'

export const PUBLIC_SESSION_KEY = 'diedo-public-customer-session'

export function rememberPublicSession({ branchId, docType, documentId }) {
  const payload = {
    branchId,
    docType: docType || 'cedula',
    documentId: normalizeDocumentId(documentId, docType),
  }
  ephemeralStorage.setItem(PUBLIC_SESSION_KEY, JSON.stringify(payload))
  return payload
}

export function recallPublicSession() {
  try {
    const raw = ephemeralStorage.getItem(PUBLIC_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.branchId || !parsed?.documentId) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPublicSession() {
  ephemeralStorage.removeItem(PUBLIC_SESSION_KEY)
}
