import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isPersistedEntityId, printInvoiceDocument } from '@/modules/pos/lib/invoicePdf'
import { printPdfBlob } from '@/lib/print'

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({ status: 'online' }),
  },
}))

const downloadSaleInvoicePdf = vi.fn()
const renderInvoicePdf = vi.fn()

vi.mock('@/services/posApi', () => ({
  posApi: {
    downloadSaleInvoicePdf: (...args) => downloadSaleInvoicePdf(...args),
  },
}))

vi.mock('@/services/documentsApi', () => ({
  documentsApi: {
    renderInvoicePdf: (...args) => renderInvoicePdf(...args),
  },
}))

vi.mock('@/lib/print', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    printPdfBlob: vi.fn(),
    printHtml: vi.fn(),
  }
})

describe('invoice PDF helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    downloadSaleInvoicePdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    renderInvoicePdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
  })

  it('detects persisted UUID sale ids', () => {
    expect(isPersistedEntityId('018f4a2a-7b2a-7f3a-9f3a-abcdef123456')).toBe(true)
    expect(isPersistedEntityId('FAC-2026-0001')).toBe(false)
  })

  it('requests server sale PDF when saleId is a UUID', async () => {
    const saleId = '018f4a2a-7b2a-7f3a-9f3a-abcdef123456'
    await printInvoiceDocument({ id: 'FAC-1', items: [{ name: 'x', qty: 1, price: 1 }] }, { saleId })
    expect(downloadSaleInvoicePdf).toHaveBeenCalledWith(saleId)
    expect(printPdfBlob).toHaveBeenCalled()
    expect(renderInvoicePdf).not.toHaveBeenCalled()
  })

  it('posts draft invoice payload when no persisted id is available', async () => {
    const data = {
      id: 'FAC-DRAFT',
      customerName: 'Cliente',
      paymentMethod: 'Efectivo',
      items: [{ name: 'Servicio', qty: 1, price: 100 }],
      subtotal: 100,
      total: 100,
    }
    await printInvoiceDocument(data)
    expect(renderInvoicePdf).toHaveBeenCalledWith(data)
    expect(downloadSaleInvoicePdf).not.toHaveBeenCalled()
  })
})
