import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  searchDiscovery: vi.fn(),
}))

vi.mock('@/services/crmApi', () => ({ crmApi: mocks }))

import { searchBusinesses } from '@/services/leadSearch'

describe('busqueda externa de leads', () => {
  beforeEach(() => vi.clearAllMocks())

  it('usa el endpoint CRM discovery y conserva datos de importacion', async () => {
    mocks.searchDiscovery.mockResolvedValue({
      provider: 'serper',
      hourUsed: 3,
      hourLimit: 50,
      monthUsed: 9,
      monthLimit: 250,
      items: [
        {
          name: 'Spa Azul',
          company: 'Spa Azul',
          phone: '809-555-0101',
          website: 'https://spa.example.com',
          location: 'Santo Domingo',
          sourceUrl: 'https://maps.example.com/spa',
          rawSnippet: 'Spa · Reservas',
          rating: 4.8,
          reviews: 120,
        },
      ],
    })

    const result = await searchBusinesses({
      q: 'spa',
      location: 'Santo Domingo',
      num: 10,
    })

    expect(mocks.searchDiscovery).toHaveBeenCalledWith({
      query: 'spa',
      location: 'Santo Domingo',
      limit: 10,
    })
    expect(result.provider).toBe('serper')
    expect(result.quota.hour).toEqual({ used: 3, limit: 50 })
    expect(result.results[0]).toMatchObject({
      name: 'Spa Azul',
      sourceUrl: 'https://maps.example.com/spa',
      rating: 4.8,
      reviews: 120,
    })
  })

  it('mantiene el codigo de cuota agotada esperado por la interfaz', async () => {
    const error = new Error('Limite horario de busqueda de leads alcanzado.')
    error.status = 429
    error.parameter = 'hourLimit'
    mocks.searchDiscovery.mockRejectedValue(error)

    await expect(searchBusinesses({ q: 'spa', location: '', num: 10 })).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      status: 429,
      parameter: 'hourLimit',
    })
  })
})
