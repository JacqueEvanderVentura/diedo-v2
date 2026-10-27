// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/modules/agenda/components/AppointmentFormModal', () => ({
  AppointmentFormModal: ({ open, onClose, defaultCustomerId }) => (
    open ? (
      <div>
        <span data-testid="appointment-modal-stub">{defaultCustomerId}</span>
        <button type="button" onClick={onClose}>cerrar cita</button>
      </div>
    ) : null
  ),
}))

vi.mock('@/modules/crm/components/CustomerFormModal', () => ({
  CustomerFormModal: ({ open, onCreated, onClose, defaults }) => (
    open ? (
      <div data-testid="customer-form-stub">
        <span data-testid="customer-form-name">{defaults?.name}</span>
        <button
          type="button"
          onClick={() => {
            onCreated?.({ id: 'cust-new', name: defaults?.name })
            onClose?.()
          }}
        >
          crear cliente
        </button>
      </div>
    ) : null
  ),
}))

import { SimplifiedLeadActions } from '@/modules/crm/components/SimplifiedLeadActions'
import { useCrmStore } from '@/stores/crmStore'
import { useCustomersStore } from '@/stores/customersStore'
import { useSessionStore } from '@/stores/sessionStore'

describe('Agendar desde CRM Simplificado', () => {
  const original = {
    convertToCustomer: useCrmStore.getState().convertToCustomer,
    updateLead: useCrmStore.getState().updateLead,
    updateQuote: useCrmStore.getState().updateQuote,
  }

  afterEach(() => {
    cleanup()
    useCrmStore.setState(original)
    useCustomersStore.setState({ customers: [] })
  })

  const openLead = (overrides = {}) => ({
    id: 'lead-1',
    branchId: 'branch-1',
    customerId: null,
    company: '',
    name: 'Ana Prospecto',
    phone: '8095550000',
    status: 'propuesta',
    updatedAt: '2026-10-26T16:00:00Z',
    ...overrides,
  })

  const setup = (lead, customers = []) => {
    const convertToCustomer = vi.fn()
    const updateLead = vi.fn()
    const updateQuote = vi.fn()
    useSessionStore.setState({
      status: 'online',
      user: { branchIds: ['branch-1'], effectivePermissionCodes: ['crm.manage'] },
    })
    useCustomersStore.setState({ customers })
    useCrmStore.setState({ leads: [lead], quotes: [], convertToCustomer, updateLead, updateQuote })
    render(<SimplifiedLeadActions lead={lead} />)
    return { convertToCustomer, updateLead, updateQuote }
  }

  it('pide la ficha, abre la cita y no convierte el lead a Ganado', async () => {
    const { convertToCustomer, updateLead } = setup(openLead())
    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))

    expect(screen.getByTestId('customer-form-name').textContent).toBe('Ana Prospecto')
    expect(screen.queryByTestId('appointment-modal-stub')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'crear cliente' }))

    await waitFor(() => {
      expect(screen.getByTestId('appointment-modal-stub').textContent).toBe('cust-new')
    })
    expect(convertToCustomer).not.toHaveBeenCalled()
    expect(updateLead).not.toHaveBeenCalled()
    expect(screen.queryByTestId('crm-simplified-actions-closed')).toBeNull()
  })

  it('abre la cita directo cuando el lead ya tiene cliente', () => {
    const customer = { id: 'cust-1', name: 'Ana Prospecto', branchIds: ['branch-1'], active: true }
    const { convertToCustomer } = setup(openLead({ customerId: 'cust-1' }), [customer])
    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))

    expect(screen.getByTestId('appointment-modal-stub').textContent).toBe('cust-1')
    expect(screen.queryByTestId('customer-form-stub')).toBeNull()
    expect(convertToCustomer).not.toHaveBeenCalled()
  })

  it('reutiliza el cliente recién creado en el siguiente clic', async () => {
    setup(openLead())
    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))
    fireEvent.click(screen.getByRole('button', { name: 'crear cliente' }))
    await waitFor(() => expect(screen.getByTestId('appointment-modal-stub')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'cerrar cita' }))
    expect(screen.queryByTestId('appointment-modal-stub')).toBeNull()

    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))
    expect(screen.queryByTestId('customer-form-stub')).toBeNull()
    expect(screen.getByTestId('appointment-modal-stub').textContent).toBe('cust-new')
  })
})
