import { describe, expect, it, vi } from 'vitest'
import { mapDocumentAttachmentsFromApi } from '@/services/adapters/documentAttachments'
import {
  ATTACHMENT_TOO_LARGE_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  mergeUploadedAttachments,
  uploadFinanceExpenseAttachments,
  uploadPurchaseReceipt,
} from '@/lib/documentAttachments'

const mocks = vi.hoisted(() => ({ upload: vi.fn() }))

vi.mock('@/services/apiClient', () => ({ apiClient: { upload: mocks.upload } }))

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
    expect(rows[0].purpose).toBeNull()
  })

  it('merges uploaded files without pending blobs', () => {
    const merged = mergeUploadedAttachments(
      [{ id: 'local-1', name: 'old.png', pendingFile: {} }],
      [{ id: 'a1', name: 'new.png', previewUrl: '/content' }]
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a1')
  })

  it('rejects files over 10 MB before uploading', async () => {
    mocks.upload.mockClear()
    const oversized = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    Object.defineProperty(oversized, 'size', { value: MAX_ATTACHMENT_BYTES + 1 })

    await expect(uploadFinanceExpenseAttachments('expense-id', [{ name: 'foto.jpg', pendingFile: oversized }]))
      .rejects.toThrow(ATTACHMENT_TOO_LARGE_MESSAGE)
    await expect(uploadPurchaseReceipt('request-id', { name: 'foto.jpg', pendingFile: oversized }))
      .rejects.toThrow(ATTACHMENT_TOO_LARGE_MESSAGE)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('uploads files within the limit', async () => {
    mocks.upload.mockReset()
    mocks.upload.mockResolvedValue({ id: 'a1', originalFilename: 'ticket.pdf', contentType: 'application/pdf' })
    const file = new File(['%PDF-1.4'], 'ticket.pdf', { type: 'application/pdf' })

    const uploaded = await uploadFinanceExpenseAttachments('expense-id', [{ name: 'ticket.pdf', pendingFile: file }])

    expect(mocks.upload).toHaveBeenCalledWith('/api/v1/finance/expenses/expense-id/attachments', expect.any(FormData))
    expect(uploaded[0].id).toBe('a1')
  })
})
