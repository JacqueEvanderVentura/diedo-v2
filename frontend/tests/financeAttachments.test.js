import { beforeEach, describe, expect, it, vi } from 'vitest'

const blobMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/apiClient', () => ({ apiClient: { blob: blobMock } }))

import {
  loadFinanceAttachmentBlob,
  mergeExpenseAttachments,
  mergeFixedAttachments,
  saveExpenseAttachments,
  saveFixedAttachments,
  serializeFinanceAttachments,
} from '@/modules/finanzas/lib/financeAttachments'

describe('financeAttachments', () => {
  beforeEach(() => {
    blobMock.mockReset()
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    })
  })

  it('serializa y restaura adjuntos por gasto', () => {
    const payload = serializeFinanceAttachments([
      { id: 'a1', name: 'factura.jpg', contentType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,abc' },
    ])
    saveExpenseAttachments('exp-1', payload)
    const merged = mergeExpenseAttachments({ id: 'exp-1', concept: 'Test' })
    expect(merged.attachments).toHaveLength(1)
    expect(merged.attachments[0].name).toBe('factura.jpg')
  })

  it('serializa PDFs y restaura gastos fijos', () => {
    const payload = serializeFinanceAttachments([
      { id: 'a2', name: 'factura.pdf', contentType: 'application/pdf', dataUrl: 'data:application/pdf;base64,abc' },
    ])
    saveFixedAttachments('fix-1', payload)
    const merged = mergeFixedAttachments({ id: 'fix-1', concept: 'Alquiler' })
    expect(merged.attachments).toHaveLength(1)
    expect(merged.attachments[0].contentType).toBe('application/pdf')
  })

  it('descarga comprobantes del servidor con el cliente autenticado de la API', async () => {
    const image = new Blob(['png'], { type: 'image/png' })
    blobMock.mockResolvedValue(image)
    const previewUrl = '/api/v1/document-attachments/att-1/content'

    const blob = await loadFinanceAttachmentBlob({
      id: 'att-1',
      name: 'comprobante.png',
      previewUrl,
      downloadUrl: previewUrl,
    })

    expect(blob).toBe(image)
    expect(blobMock).toHaveBeenCalledWith(previewUrl)
  })

  it('lee adjuntos locales sin llamar a la API', async () => {
    const blob = await loadFinanceAttachmentBlob({
      id: 'local-1',
      name: 'local.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      downloadUrl: 'data:image/png;base64,iVBORw0KGgo=',
    })

    expect(blob.type).toBe('image/png')
    expect(blobMock).not.toHaveBeenCalled()
  })
})
