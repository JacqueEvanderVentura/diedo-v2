import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadInvoiceDocument,
  isPersistedEntityId,
  isUsableInvoicePdfBlob,
  printInvoiceDocument,
} from '@/modules/pos/lib/invoicePdf'
import { openHtmlInNewTab, printHtml, printPdfBlob } from '@/lib/print'

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
    openHtmlInNewTab: vi.fn(),
  }
})

function mockValidPdfBlob() {
  return new Blob(['%PDF'.padEnd(250, '0')], { type: 'application/pdf' })
}

describe('invoice PDF helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    downloadSaleInvoicePdf.mockResolvedValue(mockValidPdfBlob())
    renderInvoicePdf.mockResolvedValue(mockValidPdfBlob())
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

  it('falls back to HTML print when the server PDF request fails', async () => {
    const saleId = '018f4a2a-7b2a-7f3a-9f3a-abcdef123456'
    downloadSaleInvoicePdf.mockRejectedValueOnce(new Error('500'))
    await printInvoiceDocument({ id: 'FAC-1', items: [{ name: 'x', qty: 1, price: 1 }] }, { saleId })
    expect(printHtml).toHaveBeenCalled()
    expect(printPdfBlob).not.toHaveBeenCalled()
  })

  it('opens printable HTML when download fails', async () => {
    renderInvoicePdf.mockRejectedValueOnce(new Error('500'))
    const data = {
      id: 'FAC-DRAFT',
      customerName: 'Cliente',
      paymentMethod: 'Efectivo',
      items: [{ name: 'Servicio', qty: 1, price: 100 }],
      subtotal: 100,
      total: 100,
    }
    await downloadInvoiceDocument(data, 'factura.pdf')
    expect(openHtmlInNewTab).toHaveBeenCalled()
  })

  it('rejects tiny stub PDF blobs', () => {
    const stub = new Blob(['%PDF-1.4\n% Helios invoice stub\n'], { type: 'application/pdf' })
    expect(isUsableInvoicePdfBlob(stub)).toBe(false)
  })

  it('falls back to HTML print when the server returns a stub PDF', async () => {
    renderInvoicePdf.mockResolvedValueOnce(
      new Blob(['%PDF-1.4\n% Helios invoice stub\n'], { type: 'application/pdf' }),
    )
    const data = {
      id: 'FAC-DRAFT',
      customerName: 'Cliente',
      paymentMethod: 'Efectivo',
      items: [{ name: 'Servicio', qty: 1, price: 100 }],
      subtotal: 100,
      total: 100,
    }
    await printInvoiceDocument(data)
    expect(printHtml).toHaveBeenCalled()
    expect(printPdfBlob).not.toHaveBeenCalled()
  })
})
