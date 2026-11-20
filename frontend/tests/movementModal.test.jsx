// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MovementModal } from '@/modules/pos/components/MovementModal'

const fixtures = vi.hoisted(() => ({
  addExpense: vi.fn(),
  addIncome: vi.fn(),
  paymentMethods: [
    {
      id: 'efectivo',
      name: 'Efectivo',
      apiId: 'cash-id',
      affectsCash: true,
      enabled: true,
      code: 'cash',
    },
    {
      id: 'tarjeta',
      name: 'Tarjeta',
      apiId: 'card-id',
      affectsCash: false,
      enabled: true,
      code: 'card',
    },
  ],
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/lib/paymentMethodsSync', () => ({
  syncWorkspacePaymentMethods: vi.fn().mockResolvedValue(fixtures.paymentMethods),
}))

vi.mock('@/lib/documentAttachments', () => ({
  uploadCashMovementAttachments: vi.fn(),
}))

vi.mock('@/modules/finanzas/lib/financeAttachments', () => ({
  saveExpenseAttachments: vi.fn(),
}))

vi.mock('@/stores/posStore', () => ({
  usePosStore: (selector) => selector({
    addExpense: fixtures.addExpense,
    addIncome: fixtures.addIncome,
    register: { id: 'register-id' },
  }),
}))

vi.mock('@/stores/configStore', () => {
  const state = { paymentMethods: fixtures.paymentMethods, setPaymentMethods: vi.fn() }
  const useConfigStore = (selector) => selector(state)
  useConfigStore.getState = () => state
  return { useConfigStore }
})

describe('MovementModal', () => {
  afterEach(() => {
    cleanup()
    fixtures.addExpense.mockReset()
    fixtures.addIncome.mockReset()
  })

  it('muestra el método de caja y registra egreso con método sincronizado', async () => {
    fixtures.addExpense.mockResolvedValue({ id: 'mov-1' })

    render(<MovementModal open onClose={vi.fn()} defaultType="egreso" />)

    await waitFor(() => {
      expect(screen.getByTestId('caja-movement-payment-method')).toBeTruthy()
    })

    fireEvent.change(screen.getByPlaceholderText('Ej. Propina, insumos'), {
      target: { value: 'Insumos mercería' },
    })
    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '925' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    await waitFor(() => {
      expect(fixtures.addExpense).toHaveBeenCalledWith({
        concept: 'Insumos mercería',
        amount: 925,
        method: 'efectivo',
        reference: null,
      })
    })
  })
})