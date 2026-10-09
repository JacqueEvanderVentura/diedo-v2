/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OptionalPreferenceCards } from '@/modules/portal/components/OptionalPreferenceCards'

describe('OptionalPreferenceCards', () => {
  it('expande correo y teléfono al activar las invitaciones', () => {
    const onToggleInvoice = vi.fn()
    const onToggleContact = vi.fn()
    const { rerender } = render(
      <OptionalPreferenceCards
        wantsInvoice={false}
        wantsContact={false}
        onToggleInvoice={onToggleInvoice}
        onToggleContact={onToggleContact}
        email=""
        onEmailChange={() => {}}
        phone=""
        onPhoneChange={() => {}}
      />
    )
    fireEvent.click(screen.getByTestId('pref-invite-invoice'))
    expect(onToggleInvoice).toHaveBeenCalled()
    rerender(
      <OptionalPreferenceCards
        wantsInvoice
        wantsContact={false}
        onToggleInvoice={onToggleInvoice}
        onToggleContact={onToggleContact}
        email="a@b.com"
        onEmailChange={() => {}}
        phone=""
        onPhoneChange={() => {}}
      />
    )
    expect(screen.getByTestId('pref-expanded-invoice')).toBeTruthy()
    fireEvent.click(screen.getByTestId('pref-invite-contact'))
    expect(onToggleContact).toHaveBeenCalled()
  })
})
