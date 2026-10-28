export const GENERIC_SERVER_ERROR = 'Error interno del servidor.'

export function publicHttpErrorMessage(status, data, requestId) {
  const rid = requestId || data?.requestId || data?.request_id || ''
  const message = String(data?.message || '').trim()
  const hasDomainMessage = Boolean(message) && message !== GENERIC_SERVER_ERROR
  if (status === 503 && hasDomainMessage) return message
  if (status >= 500) {
    return rid
      ? `No pudimos completar la acción. Si sigue, copia este código: ${rid}.`
      : 'No pudimos completar la acción. Inténtalo de nuevo.'
  }
  if (!hasDomainMessage) {
    return `Error ${status}`
  }
  return message
}

export function readResponseRequestId(response, data) {
  return data?.requestId || data?.request_id || response?.headers?.get?.('X-Request-Id') || ''
}
