import { describe, expect, it } from 'vitest'
import {
  documentCount,
  documentsForPurpose,
  latestDocument,
} from '@/modules/compras/lib/purchaseDocuments'

describe('documentos de compra', () => {
  const request = {
    quoteFile: { name: 'cotizacion.pdf', previewUrl: '/quote' },
    attachments: [
      { purpose: 'invoice', name: 'factura.pdf' },
      { purpose: 'payment', name: 'pago.png' },
      { purpose: 'receipt', name: 'recibo.jpg' },
    ],
  }

  it('expone cotización, factura, pago y recibimiento', () => {
    expect(latestDocument(request, 'quote').name).toBe('cotizacion.pdf')
    expect(latestDocument(request, 'invoice').name).toBe('factura.pdf')
    expect(latestDocument(request, 'payment').name).toBe('pago.png')
    expect(latestDocument(request, 'receipt').name).toBe('recibo.jpg')
    expect(documentCount(request)).toBe(4)
    expect(documentsForPurpose({ attachments: [] }, 'quote')).toEqual([])
  })
})
