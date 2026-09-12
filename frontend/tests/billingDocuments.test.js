import { describe, expect, it } from 'vitest'
import {
  applyBillingBrandingToInvoiceData,
  formatCustomerTaxLine,
  resolveBillingBranding,
} from '@/modules/configuracion/lib/billingDocuments'
import { buildInvoiceHtml } from '@/modules/pos/lib/invoice'

describe('billingDocuments', () => {
  it('aplica logo y RNC del emisor', () => {
    const data = applyBillingBrandingToInvoiceData(
      { id: 'FAC-1', kind: 'sale', customerName: 'Cliente', items: [], subtotal: 0, total: 0, taxPct: 18, taxAmt: 0, discountAmt: 0, discountPct: 0 },
      {
        businessName: 'Helios',
        billingDocuments: {
          tradeName: 'Mi Spa',
          legalName: 'Mi Spa SRL',
          rnc: '1-1111111-1',
          logoDataUrl: 'data:image/png;base64,abc',
        },
      },
      [],
    )
    expect(data.businessName).toBe('Mi Spa')
    expect(data.businessRnc).toBe('1-1111111-1')
    const html = buildInvoiceHtml({ ...data, issuedAt: 'hoy', paymentMethod: 'Efectivo' })
    expect(html).toContain('RNC 1-1111111-1')
    expect(html).toContain('data:image/png;base64,abc')
  })

  it('muestra cédula o RNC del cliente según tipo', () => {
    expect(formatCustomerTaxLine({
      customerType: 'b2c',
      docType: 'cedula',
      documentId: '001-1234567-8',
    })).toBe('Cédula: 001-1234567-8')
    expect(formatCustomerTaxLine({
      customerType: 'b2b',
      docType: 'rnc',
      documentId: '1-2222222-2',
    })).toBe('RNC: 1-2222222-2')
  })

  it('usa nombre comercial con fallback', () => {
    const brand = resolveBillingBranding({ businessName: 'Helios 360', billingDocuments: {} })
    expect(brand.businessName).toBe('Helios 360')
  })
})
