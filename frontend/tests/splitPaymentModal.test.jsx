/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SplitPaymentModal } from '@/modules/pos/components/SplitPaymentModal'

const methods = [
  { id: 'efectivo', name: 'Efectivo', icon: 'Banknote', enabled: true },
  { id: 'tarjeta', name: 'Tarjeta', icon: 'CreditCard', enabled: true },
]

describe('SplitPaymentModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('habilita confirmar abono cuando queda saldo a CxC', () => {
    const onConfirm = vi.fn()
    render(
      <SplitPaymentModal
        open
        onClose={vi.fn()}
        total={1000}
        paymentMethods={methods}
        initialTenders={null}
        onConfirm={onConfirm}
      />
    )

    const confirm = screen.getByTestId('split-payment-confirm')
    expect(confirm.disabled).toBe(true)

    fireEvent.change(screen.getByTestId('split-payment-amount-efectivo'), {
      target: { value: '500' },
    })

    expect(confirm.disabled).toBe(false)
    expect(confirm.textContent).toMatch(/Confirmar abono/)
    expect(screen.getByTestId('split-payment-outstanding').textContent).toMatch(/Saldo a cuenta por cobrar/)

    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith([
      { methodId: 'efectivo', amount: 500, reference: null },
    ])
  })
})
