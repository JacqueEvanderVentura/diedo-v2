import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mergeExpenseAttachments,
  saveExpenseAttachments,
  serializeFinanceAttachments,
} from '@/modules/finanzas/lib/financeAttachments'

describe('financeAttachments', () => {
  beforeEach(() => {
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
})
