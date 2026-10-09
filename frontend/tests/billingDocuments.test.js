import { describe, expect, it } from 'vitest'
import {
  applyBillingBrandingToInvoiceData,
  assignBranchToTemplate,
  formatCustomerTaxLine,
  normalizeBillingDocumentsState,
  resolveBillingBranding,
} from '@/modules/configuracion/lib/billingDocuments'
import { buildInvoiceHtml } from '@/modules/pos/lib/invoice'

describe('billingDocuments', () => {
  it('aplica logo y RNC del emisor desde plantilla', () => {
    const data = applyBillingBrandingToInvoiceData(
      { id: 'FAC-1', kind: 'sale', customerName: 'Cliente', items: [], subtotal: 0, total: 0, taxPct: 18, taxAmt: 0, discountAmt: 0, discountPct: 0 },
      {
        businessName: 'Helios',
        billingDocuments: {
          templates: [
            {
              id: 'tpl-1',
              name: 'Principal',
              branchIds: [],
              tradeName: 'Mi Spa',
              legalName: 'Mi Spa SRL',
              rnc: '1-1111111-1',
              logoDataUrl: 'data:image/png;base64,abc',
            },
          ],
        },
      },
      [],
    )
    expect(data.businessName).toBe('Mi Spa')
    expect(data.businessRnc).toBe('1-1111111-1')
    const html = buildInvoiceHtml({ ...data, issuedAt: 'hoy', paymentMethod: 'Efectivo' })
    expect(html).toContain('RNC: 1-1111111-1')
    expect(html).toContain('invoice-footer-divider')
    expect(html).toContain('data:image/png;base64,abc')
  })

  it('envuelve el shape legado en una plantilla', () => {
    const state = normalizeBillingDocumentsState({
      tradeName: 'Legacy Spa',
      rnc: '1-2222222-2',
    })
    expect(state.templates).toHaveLength(1)
    expect(state.templates[0].name).toBe('Principal')
    expect(state.templates[0].tradeName).toBe('Legacy Spa')
  })

  it('resuelve plantilla por sucursal', () => {
    const brand = resolveBillingBranding(
      {
        businessName: 'Helios 360',
        billingDocuments: {
          templates: [
            { id: 'a', name: 'Default', branchIds: [], tradeName: 'General' },
            { id: 'b', name: 'Este', branchIds: ['br-este'], tradeName: 'Sucursal Este' },
          ],
        },
      },
      { id: 'br-este' },
    )
    expect(brand.businessName).toBe('Sucursal Este')
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
    const brand = resolveBillingBranding({ businessName: 'Helios 360', billingDocuments: { templates: [{ id: 'x', name: 'P', branchIds: [] }] } })
    expect(brand.businessName).toBe('Helios 360')
  })

  it('asigna sucursales de forma exclusiva entre plantillas', () => {
    const templates = assignBranchToTemplate(
      [
        { id: 'a', branchIds: ['br-1', 'br-2'] },
        { id: 'b', branchIds: ['br-3'] },
      ],
      'b',
      ['br-1'],
    )
    expect(templates.find((row) => row.id === 'b')?.branchIds).toEqual(['br-1'])
    expect(templates.find((row) => row.id === 'a')?.branchIds).toEqual(['br-2'])
  })
})
