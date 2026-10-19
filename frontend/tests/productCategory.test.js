import { describe, expect, it } from 'vitest'
import { productMatchesPosCategory } from '@/modules/pos/lib/productCategory'

describe('productMatchesPosCategory', () => {
  const categories = [
    { id: 'cat-laser', name: 'Laser', type: 'producto' },
    { id: 'cat-insumos', name: 'Insumos', type: 'producto' },
  ]

  it('matches by category uuid', () => {
    expect(productMatchesPosCategory({ category: 'cat-laser' }, 'cat-laser', categories)).toBe(true)
    expect(productMatchesPosCategory({ category: 'cat-laser' }, 'cat-insumos', categories)).toBe(false)
  })

  it('matches legacy slug against category name', () => {
    expect(productMatchesPosCategory({ category: 'insumos' }, 'cat-insumos', categories)).toBe(true)
    expect(productMatchesPosCategory({ category: 'laser' }, 'cat-laser', categories)).toBe(true)
  })

  it('treats all as no filter', () => {
    expect(productMatchesPosCategory({ category: 'x' }, 'all', categories)).toBe(true)
  })
})
