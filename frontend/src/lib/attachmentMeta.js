const MIME_LABELS = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
}

export function attachmentTypeLabel(attachment) {
  const type = attachment?.contentType || attachment?.mimeType || ''
  if (MIME_LABELS[type]) return MIME_LABELS[type]
  if (type.startsWith('image/')) return type.replace('image/', '').toUpperCase()
  if (type) return type.split('/').pop()?.toUpperCase() || type
  const name = attachment?.name || attachment?.filename || ''
  const ext = name.split('.').pop()
  return ext ? ext.toUpperCase() : 'Archivo'
}

export function formatAttachmentSize(bytes) {
  const size = Number(bytes)
  if (!size || Number.isNaN(size)) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function formatAttachmentSizeFromItem(item) {
  return formatAttachmentSize(item?.sizeBytes ?? item?.size)
}
