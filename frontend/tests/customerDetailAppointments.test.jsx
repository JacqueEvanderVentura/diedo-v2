// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'

const hydrateAppointments = vi.fn(() => Promise.resolve([]))

vi.mock('@/stores/agendaStore', () => ({
  useAgendaStore: (selector) => selector({
    appointments: [],
    hydrateAppointments,
    resources: [],
  }),
  statusMeta: (id) => ({ name: id, tone: 'brand' }),
  todayKey: () => '2026-01-15',
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) => selector({
    hasPermission: (perm) => perm === 'appointment.read',
  }),
}))

vi.mock('@/stores/posStore', () => ({
  usePosStore: (selector) => selector({ sales: [], receivables: [] }),
}))

vi.mock('@/stores/crmStore', () => ({
  useCrmStore: (selector) => selector({ sales: [], leads: [], quotes: [], activities: [] }),
}))

vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({ branches: [] }),
}))

vi.mock('@/services/portalTasksApi', () => ({
  portalTasksApi: { customerTasks: vi.fn(() => Promise.resolve({ items: [] })) },
}))

vi.mock('@/modules/crm/hooks/useCrmCapabilities', () => ({
  useCrmCapabilities: () => ({}),
}))

import { CustomerDetailPanel } from '@/modules/crm/components/CustomerDetailModal'

const customer = {
  id: 'cust-99',
  name: 'Ana',
  phone: '809',
  branchIds: [],
}

describe('CustomerDetailPanel appointment hydrate', () => {
  beforeEach(() => {
    hydrateAppointments.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('hidrata citas por customerId al montar el detalle', async () => {
    render(
      <CustomerDetailPanel
        customer={customer}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    )

    await waitFor(() => {
      expect(hydrateAppointments).toHaveBeenCalledWith({
        force: true,
        params: { customerId: 'cust-99' },
      })
    })
  })
})