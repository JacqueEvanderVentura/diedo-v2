// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SaleEditModal } from '@/modules/crm/components/SaleEditModal'

const fixtures = vi.hoisted(() => ({
  paymentMethods: [
    { id: 'efectivo', name: 'Efectivo', enabled: true },
    { id: 'transferencia', name: 'Transferencia', enabled: true },
  ],
  updateSale: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/components/customers/CustomerPicker', () => ({
  CustomerPicker: () => <div data-testid="customer-picker" />,
}))

vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({
    paymentMethods: fixtures.paymentMethods,
    settings: { taxPct: 18 },
  }),
}))

vi.mock('@/stores/posStore', () => ({
  usePosStore: (selector) => selector({
    updateSale: fixtures.updateSale,
    register: { open: true },
    mutating: false,
  }),
}))

const baseSale = {
  id: 'sale-1',
  method: 'efectivo',
  reference: '',
  notes: '',
  discountAmt: 0,
  discountPct: 0,
  items: [
    {
      id: 'line-1',
      name: 'Paq. 12 Sesiones',
      qty: 1,
      price: 6500,
    },
  ],
}

describe('SaleEditModal', () => {
  afterEach(() => {
    cleanup()
    fixtures.updateSale.mockReset()
  })

  it('muestra el nombre del método de pago en el Select estándar', () => {
    render(
      <SaleEditModal open onClose={vi.fn()} sale={baseSale} nested />
    )

    const trigger = screen.getByTestId('sale-edit-method')
    expect(trigger.textContent).toContain('Efectivo')
  })

  it('usa step 1 en cantidad y valor de descuento', () => {
    render(
      <SaleEditModal open onClose={vi.fn()} sale={baseSale} />
    )

    expect(screen.getByTestId('sale-edit-qty-0').getAttribute('step')).toBe('1')
    expect(screen.getByTestId('sale-edit-discount-value').getAttribute('step')).toBe('1')
  })

  it('formatea el precio de línea con separador de miles', () => {
    render(
      <SaleEditModal open onClose={vi.fn()} sale={baseSale} />
    )

    expect(screen.getByTestId('sale-edit-price-0').value).toBe('6,500')
  })

  it('abre opciones de forma de pago con etiquetas visibles', () => {
    render(
      <SaleEditModal open onClose={vi.fn()} sale={baseSale} nested />
    )

    fireEvent.click(screen.getByTestId('sale-edit-method'))
    expect(screen.getByRole('option', { name: /Transferencia/i })).toBeTruthy()
  })
})