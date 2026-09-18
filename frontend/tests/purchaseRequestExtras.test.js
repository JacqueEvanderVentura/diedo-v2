import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mergePurchaseRequestExtras,
  savePurchaseRequestExtras,
} from '@/modules/compras/lib/purchaseRequestExtras'
import { purchaseLinesForInventory } from '@/modules/compras/lib/receivePurchaseInventory'

describe('purchaseRequestExtras', () => {
  beforeEach(() => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    })
  })

  it('restaura cotización e insumos vinculados', () => {
    savePurchaseRequestExtras('req-1', {
      quoteFile: { name: 'cot.pdf', contentType: 'application/pdf', dataUrl: 'data:application/pdf;base64,abc' },
      items: [{ supplyProductId: 'sup-1', supplyCategoryId: 'cat-insumo' }],
    })
    const merged = mergePurchaseRequestExtras({
      id: 'req-1',
      items: [{ name: 'Guantes', qty: 2 }],
    })
    expect(merged.quoteFile?.name).toBe('cot.pdf')
    expect(merged.items[0].supplyProductId).toBe('sup-1')
  })
})

describe('receivePurchaseInventory helpers', () => {
  it('filtra líneas con insumo vinculado', () => {
    const lines = purchaseLinesForInventory({
      items: [
        { name: 'A', qty: 1, supplyProductId: 'sup-1' },
        { name: 'B', qty: 2 },
      ],
    })
    expect(lines).toHaveLength(1)
  })
})
