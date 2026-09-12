import { describe, expect, it } from 'vitest'
import { buildInvoiceHtml } from '@/modules/pos/lib/invoice'
import { buildInvoiceDataFromQuote, buildInvoiceDataFromSale } from '@/modules/crm/lib/sales'

const branches = [
  { id: 'charm-dn', name: 'Charm DN' },
  { id: 'charm-este', name: 'Charm Este' },
]

const settings = { businessName: 'Helios 360', region: 'Santo Domingo' }

describe('documentos de venta y cotización', () => {
  it('incluye sucursal y líneas al generar factura desde venta CRM', () => {
    const data = buildInvoiceDataFromSale({
      id: 'sale-1',
      number: 'FAC-20260908-0001',
      branchId: 'charm-dn',
      createdAt: '2026-09-08T12:00:00.000Z',
      customer: { name: 'María Fernández', phone: '809-555-0000' },
      method: 'efectivo',
      items: [
        { name: '1 sesión axilas', qty: 1, price: 900, listPrice: 900 },
        { name: 'Red Bull', qty: 2, price: 180, listPrice: 180 },
      ],
      subtotal: 1260,
      discountAmt: 0,
      taxPct: 18,
      taxAmt: 226.8,
      total: 1486.8,
    }, { branches, settings, paymentMethods: [{ id: 'efectivo', name: 'Efectivo' }] })

    expect(data.id).toBe('FAC-20260908-0001')
    expect(data.branchName).toBe('Charm DN')
    expect(data.items).toHaveLength(2)

    const html = buildInvoiceHtml(data)
    expect(html).toContain('Charm DN')
    expect(html).toContain('1 sesión axilas')
    expect(html).toContain('FAC-20260908-0001')
    expect(html).toContain('/favicon.svg')
    expect(html).not.toContain('<svg')
  })

  it('genera cotización CRM con código COT y líneas en HTML/PDF', () => {
    const data = buildInvoiceDataFromQuote({
      id: 'qt-1',
      number: 'COT-2026-001',
      branchId: 'charm-este',
      customerName: 'Glamour Studio RD',
      createdAt: '2026-09-08T10:00:00.000Z',
      validUntil: '2026-09-23T10:00:00.000Z',
      items: [
        { name: 'Módulo Agenda', qty: 1, price: 25000 },
        { name: 'Módulo POS', qty: 1, price: 20000 },
      ],
      total: 45000,
    }, { branches, settings, customers: [] })

    expect(data.kind).toBe('quote')
    expect(data.id).toBe('COT-2026-001')
    expect(data.branchName).toBe('Charm Este')
    expect(data.items).toHaveLength(2)

    const html = buildInvoiceHtml(data)
    expect(html).toContain('Cotización')
    expect(html).toContain('COT-2026-001')
    expect(html).toContain('Charm Este')
    expect(html).toContain('Módulo Agenda')
    expect(html).toContain('Válida hasta')
  })
})
