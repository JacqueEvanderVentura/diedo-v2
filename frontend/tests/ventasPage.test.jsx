/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('@/stores/crmStore', () => ({
  useCrmStore: (selector) => selector({ uiMode: 'standard', sales: [] }),
}))

vi.mock('@/stores/posStore', () => ({
  usePosStore: (selector) => selector({
    sales: [
      {
        id: 'sale-1',
        number: 'VTA-1',
        method: 'efectivo',
        total: 500,
        createdAt: '2026-10-01T12:00:00.000Z',
        branchId: 'b1',
        customer: { name: 'Cliente A' },
        soldBy: 'Franchesko',
        status: 'completed',
      },
      {
        id: 'sale-2',
        number: 'VTA-2',
        method: 'tarjeta',
        total: 800,
        createdAt: '2026-10-02T12:00:00.000Z',
        branchId: 'b1',
        customer: { name: 'Cliente B' },
        soldBy: 'Otro Usuario',
        status: 'completed',
      },
    ],
    receivables: [],
  }),
}))

vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({
    branches: [{ id: 'b1', name: 'Charm DN' }],
  }),
}))

vi.mock('@/modules/crm/components/SaleDetailModal', () => ({
  SaleDetailModal: () => null,
}))

import VentasPage from '@/modules/crm/pages/VentasPage'

afterEach(() => {
  cleanup()
})

describe('VentasPage soldBy', () => {
  it('muestra columna Creado por y filtra por usuario', () => {
    render(<VentasPage />)
    const table = screen.getByTestId('ventas-table')
    expect(within(table).getByText('Creado por')).toBeTruthy()
    expect(within(table).getByText('Franchesko')).toBeTruthy()
    expect(within(table).getByText('Otro Usuario')).toBeTruthy()

    fireEvent.change(screen.getByTestId('ventas-search'), { target: { value: 'Franchesko' } })
    expect(screen.getByTestId('ventas-row-sale-1')).toBeTruthy()
    expect(screen.queryByTestId('ventas-row-sale-2')).toBeNull()
  })
})