export function mapDocumentAttachmentFromApi(item) {
  if (!item) return null
  return {
    id: item.id,
    name: item.originalFilename || item.name || 'Adjunto',
    contentType: item.contentType || item.content_type || 'application/octet-stream',
    sizeBytes: item.sizeBytes ?? item.size_bytes ?? null,
    checksumSha256: item.checksumSha256 || item.checksum_sha256 || null,
    previewUrl: item.previewUrl || item.preview_url || null,
    downloadUrl: item.previewUrl || item.preview_url || null,
  }
}

export function mapDocumentAttachmentsFromApi(items = []) {
  return (items || []).map(mapDocumentAttachmentFromApi).filter(Boolean)
}
