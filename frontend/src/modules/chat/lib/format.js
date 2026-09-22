export function formatChatTimestamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  if (sameDay) {
    return date.toLocaleString('es-DO', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleString('es-DO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function conversationTitle(conversation) {
  const name = conversation?.participantDisplayName?.trim()
  if (name) return name
  const id = conversation?.participantProviderId
  return id ? `Contacto ${id.slice(-6)}` : 'Conversación'
}
