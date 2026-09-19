import { describe, expect, it } from 'vitest'
import {
  normalizeCrmPageSize,
  API_MAX_CRM_PAGE_SIZE,
  CRM_PAGE_SIZE_OPTIONS,
} from '@/modules/crm/constants/paging'

describe('normalizeCrmPageSize', () => {
  it('exposes 50, 200, 500 for clientes and leads', () => {
    expect(CRM_PAGE_SIZE_OPTIONS).toEqual([50, 200, 500])
    expect(API_MAX_CRM_PAGE_SIZE).toBe(500)
  })

  it('clamps above API max', () => {
    expect(normalizeCrmPageSize(500)).toBe(500)
    expect(normalizeCrmPageSize(999)).toBe(API_MAX_CRM_PAGE_SIZE)
  })

  it('defaults invalid values', () => {
    expect(normalizeCrmPageSize(0)).toBe(50)
  })
})
