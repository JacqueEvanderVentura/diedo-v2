import { describe, expect, it } from 'vitest'
import { mapDocumentAttachmentsFromApi } from '@/services/adapters/documentAttachments'
import { mergeUploadedAttachments } from '@/lib/documentAttachments'

describe('documentAttachments', () => {
  it('maps API attachment payloads', () => {
    const rows = mapDocumentAttachmentsFromApi([
      {
        id: 'a1',
        originalFilename: 'factura.pdf',
        contentType: 'application/pdf',
        previewUrl: '/api/v1/document-attachments/a1/content',
      },
    ])
    expect(rows[0].name).toBe('factura.pdf')
    expect(rows[0].previewUrl).toContain('/content')
  })

  it('merges uploaded files without pending blobs', () => {
    const merged = mergeUploadedAttachments(
      [{ id: 'local-1', name: 'old.png', pendingFile: {} }],
      [{ id: 'a1', name: 'new.png', previewUrl: '/content' }]
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a1')
  })
})
