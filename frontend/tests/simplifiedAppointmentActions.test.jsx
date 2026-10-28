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

vi.mock('@/modules/crm/components/LeadConvertModal', () => ({
  LeadConvertModal: ({ open, onConverted, onClose, lead, forPipelineClose }) => (
    open ? (
      <div data-testid="lead-convert-stub" data-for-close={String(forPipelineClose)}>
        <span data-testid="lead-convert-name">{lead?.name}</span>
        <button
          type="button"
          onClick={() => {
            onConverted?.({ id: 'cust-new', name: lead?.name }, lead)
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
    fetchLeadQuotes: useCrmStore.getState().fetchLeadQuotes,
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

  const setup = (lead, { customers = [], quotes = [], convertToCustomer = vi.fn() } = {}) => {
    const updateLead = vi.fn()
    const updateQuote = vi.fn()
    const fetchLeadQuotes = vi.fn().mockResolvedValue(quotes)
    useSessionStore.setState({
      status: 'online',
      user: { branchIds: ['branch-1'], effectivePermissionCodes: ['crm.manage'] },
    })
    useCustomersStore.setState({ customers })
    useCrmStore.setState({ leads: [lead], quotes, convertToCustomer, updateLead, updateQuote, fetchLeadQuotes })
    const view = render(<SimplifiedLeadActions lead={lead} />)
    return { convertToCustomer, updateLead, updateQuote, fetchLeadQuotes, view }
  }

  it('pide el documento, abre la cita y no convierte el lead a Ganado', async () => {
    const { convertToCustomer, updateLead } = setup(openLead())
    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))

    expect(screen.getByTestId('lead-convert-name').textContent).toBe('Ana Prospecto')
    expect(screen.getByTestId('lead-convert-stub').dataset.forClose).toBe('false')
    expect(screen.queryByTestId('appointment-modal-stub')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'crear cliente' }))

    await waitFor(() => {
      expect(screen.getByTestId('appointment-modal-stub').textContent).toBe('cust-new')
    })
    expect(convertToCustomer).not.toHaveBeenCalled()
    expect(updateLead).not.toHaveBeenCalled()
    expect(screen.queryByTestId('crm-simplified-actions-closed')).toBeNull()
  })

  it('convierte con el documento del lead y abre la cita sin cambiar etapa', async () => {
    const convertToCustomer = vi.fn().mockResolvedValue({ id: 'cust-doc' })
    const { updateLead } = setup(openLead({ documentId: '001-1234567-8' }), { convertToCustomer })
    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))

    await waitFor(() => {
      expect(screen.getByTestId('appointment-modal-stub').textContent).toBe('cust-doc')
    })
    expect(convertToCustomer).toHaveBeenCalledWith('lead-1')
    expect(updateLead).not.toHaveBeenCalled()
    expect(screen.queryByTestId('lead-convert-stub')).toBeNull()
  })

  it('muestra el error si la conversión falla', async () => {
    const convertToCustomer = vi.fn().mockRejectedValue(new Error('boom'))
    setup(openLead({ documentId: '001-1234567-8' }), { convertToCustomer })
    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))

    await waitFor(() => expect(convertToCustomer).toHaveBeenCalled())
    expect(screen.queryByTestId('appointment-modal-stub')).toBeNull()
  })

  it('abre la cita directo cuando el lead ya tiene cliente', () => {
    const customer = { id: 'cust-1', name: 'Ana Prospecto', branchIds: ['branch-1'], active: true }
    const { convertToCustomer } = setup(openLead({ customerId: 'cust-1' }), { customers: [customer] })
    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))

    expect(screen.getByTestId('appointment-modal-stub').textContent).toBe('cust-1')
    expect(screen.queryByTestId('lead-convert-stub')).toBeNull()
    expect(convertToCustomer).not.toHaveBeenCalled()
  })

  it('usa el cliente de la cotización del lead', () => {
    const quotes = [{ id: 'q-1', leadId: 'lead-1', customerId: 'cust-q', items: [] }]
    setup(openLead(), { quotes })
    fireEvent.click(screen.getByTestId('crm-simplified-appointment'))

    expect(screen.getByTestId('appointment-modal-stub').textContent).toBe('cust-q')
  })
})

describe('Ganado en CRM Simplificado', () => {
  const original = {
    updateLead: useCrmStore.getState().updateLead,
    fetchLeadQuotes: useCrmStore.getState().fetchLeadQuotes,
  }

  afterEach(() => {
    cleanup()
    useCrmStore.setState(original)
  })

  const wonLead = { id: 'lead-9', branchId: 'branch-1', customerId: 'cust-9', name: 'Ana', status: 'cerrado' }

  const setup = (quotes = []) => {
    const updateLead = vi.fn().mockResolvedValue(undefined)
    const fetchLeadQuotes = vi.fn().mockResolvedValue(quotes)
    useSessionStore.setState({
      status: 'online',
      user: { branchIds: ['branch-1'], effectivePermissionCodes: ['crm.manage'] },
    })
    useCrmStore.setState({ leads: [wonLead], quotes, updateLead, fetchLeadQuotes })
    render(<SimplifiedLeadActions lead={wonLead} />)
    return { updateLead, fetchLeadQuotes }
  }

  it('permite reabrir un Ganado sin venta', async () => {
    const { updateLead, fetchLeadQuotes } = setup()
    expect(fetchLeadQuotes).toHaveBeenCalledWith('lead-9')
    fireEvent.click(screen.getByTestId('crm-simplified-reopen'))
    fireEvent.click(screen.getByTestId('crm-simplified-reopen-confirm'))
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('lead-9', { status: 'propuesta' }))
  })

  it('no ofrece reabrir cuando ya hay una venta', () => {
    setup([{ id: 'q-9', leadId: 'lead-9', customerId: 'cust-9', convertedSaleId: 'sale-1', status: 'convertida', items: [{ id: 'i1' }] }])
    expect(screen.getByTestId('crm-simplified-actions-closed').textContent).toContain('venta registrada')
    expect(screen.queryByTestId('crm-simplified-reopen')).toBeNull()
  })
})
