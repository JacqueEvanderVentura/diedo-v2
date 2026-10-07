import { describe, expect, it } from 'vitest'
import {
  incomeCategoryLabel,
  incomeCategorySemanticKey,
} from '@/modules/finanzas/lib/incomeCategory'

describe('incomeCategory', () => {
  it('normaliza códigos POS a claves semánticas', () => {
    expect(incomeCategorySemanticKey('cash')).toBe('efectivo')
    expect(incomeCategorySemanticKey('transfer')).toBe('transferencia')
    expect(incomeCategorySemanticKey('credit')).toBe('cxc')
    expect(incomeCategorySemanticKey('payment_link')).toBe('link')
  })

  it('etiqueta métodos en español sin config', () => {
    expect(incomeCategoryLabel('cash')).toBe('Efectivo')
    expect(incomeCategoryLabel('transfer')).toBe('Transferencia')
    expect(incomeCategoryLabel('credit')).toBe('Cta. por Cobrar')
    expect(incomeCategoryLabel('servicios')).toBe('Servicios')
  })

  it('prefiere el nombre configurado del workspace', () => {
    const label = incomeCategoryLabel('cash', [
      { id: 'efectivo', code: 'cash', name: 'POS' },
    ])
    expect(label).toBe('POS')
  })

  it('agrupa cash y efectivo bajo la misma clave', () => {
    expect(incomeCategorySemanticKey('cash')).toBe(incomeCategorySemanticKey('efectivo'))
  })
})
