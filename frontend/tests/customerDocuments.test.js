import { describe, expect, it } from 'vitest'
import { validateCustomerDocument, normalizeDocumentId } from '@/lib/customerDocuments'

describe('customerDocuments', () => {
  it('valida cédula de 11 dígitos', () => {
    expect(validateCustomerDocument('cedula', '001-1234567-8')).toBe('')
    expect(validateCustomerDocument('cedula', '0011234567')).not.toBe('')
  })

  it('valida RNC de 9 dígitos', () => {
    expect(validateCustomerDocument('rnc', '132908902')).toBe('')
    expect(validateCustomerDocument('rnc', '123')).not.toBe('')
  })

  it('normaliza pasaporte en mayúsculas', () => {
    expect(normalizeDocumentId('ab-12', 'pasaporte')).toBe('AB12')
  })
})
