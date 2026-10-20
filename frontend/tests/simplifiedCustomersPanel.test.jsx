// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/modules/crm/components/CustomerFormModal', () => ({
  CustomerFormModal: ({ open }) => (open ? <div data-testid="customer-form-open">Nuevo cliente</div> : null),
}))

vi.mock('@/modules/crm/components/CustomerDetailModal', () => ({
  CustomerDetailPanel: () => <div data-testid="customer-detail-panel" />,
}))

vi.mock('@/modules/crm/components/QuoteFormModal', () => ({
  QuoteFormModal: () => null,
}))

vi.mock('@/modules/crm/components/ActivityFormModal', () => ({
  ActivityFormModal: () => null,
}))

vi.mock('@/modules/crm/components/SaleDetailModal', () => ({
  SaleDetailModal: () => null,
}))

vi.mock('@/modules/agenda/components/AppointmentFormModal', () => ({
  AppointmentFormModal: () => null,
}))

vi.mock('@/stores/crmStore', () => ({
  useCrmStore: {
    getState: () => ({
      hydrateSection: vi.fn(() => Promise.resolve()),
    }),
  },
}))

vi.mock('@/stores/agendaStore', () => ({
  useAgendaStore: {
    getState: () => ({
      hydrateAppointments: vi.fn(() => Promise.resolve()),
    }),
  },
}))

vi.mock('@/stores/customersStore', () => ({
  useCustomersStore: (selector) => selector({
    customers: [],
    customersListMeta: { page: 1, totalPages: 1, totalItems: 0, pageSize: 25 },
    fetchCustomersPage: vi.fn(() => Promise.resolve()),
    setCustomersPage: vi.fn(() => Promise.resolve()),
    setCustomersPageSize: vi.fn(() => Promise.resolve()),
    deleteCustomers: vi.fn(),
  }),
}))

vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({ branches: [] }),
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) => selector({
    status: 'online',
    user: { branchIds: [] },
  }),
}))

vi.mock('@/modules/crm/hooks/useCrmCapabilities', () => ({
  useCrmCapabilities: () => ({ customer: true, manage: true }),
}))

import { SimplifiedCustomersPanel } from '@/modules/crm/components/SimplifiedCustomersPanel'

describe('SimplifiedCustomersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('abre el formulario de cliente al pulsar Nuevo cliente', () => {
    render(<SimplifiedCustomersPanel />)
    expect(screen.queryByTestId('customer-form-open')).toBeNull()
    fireEvent.click(screen.getByTestId('crm-simplified-customers-new-btn'))
    expect(screen.getByTestId('customer-form-open')).toBeTruthy()
  })

  it('muestra acción de crear en el estado vacío', () => {
    render(<SimplifiedCustomersPanel />)
    fireEvent.click(screen.getByTestId('crm-simplified-customers-empty-new'))
    expect(screen.getByTestId('customer-form-open')).toBeTruthy()
  })
})
