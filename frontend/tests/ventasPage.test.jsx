/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const now = new Date()
const inCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0).toISOString()
const outsideCurrentMonth = new Date(now.getFullYear(), now.getMonth() - 2, 15, 12, 0, 0).toISOString()

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
        createdAt: inCurrentMonth,
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
        createdAt: outsideCurrentMonth,
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
    expect(screen.queryByTestId('ventas-row-sale-2')).toBeNull()

    fireEvent.change(screen.getByTestId('ventas-search'), { target: { value: 'Franchesko' } })
    expect(screen.getByTestId('ventas-row-sale-1')).toBeTruthy()
    expect(screen.queryByTestId('ventas-row-sale-2')).toBeNull()
  })
})

describe('VentasPage date filter', () => {
  it('con Este mes solo muestra ventas del período actual', () => {
    render(<VentasPage />)
    expect(screen.getByTestId('ventas-row-sale-1')).toBeTruthy()
    expect(screen.queryByTestId('ventas-row-sale-2')).toBeNull()
  })

  it('con Todo el historial muestra todas las ventas', () => {
    render(<VentasPage />)
    fireEvent.click(screen.getByTestId('ventas-date-filter-all'))
    expect(screen.getByTestId('ventas-row-sale-1')).toBeTruthy()
    expect(screen.getByTestId('ventas-row-sale-2')).toBeTruthy()
  })
})