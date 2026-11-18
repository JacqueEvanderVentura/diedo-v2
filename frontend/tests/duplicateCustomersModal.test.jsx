// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const fetchDuplicateCustomers = vi.fn()
const mergeDuplicateCustomers = vi.fn()
const autoMergeDuplicateCustomers = vi.fn()

vi.mock('@/stores/customersStore', () => ({
  useCustomersStore: (selector) => selector({
    fetchDuplicateCustomers,
    mergeDuplicateCustomers,
    autoMergeDuplicateCustomers,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))

import { DuplicateCustomersModal } from '@/modules/crm/components/DuplicateCustomersModal'

const group = {
  matchType: 'phone',
  matchValue: '8095551111',
  customers: [
    { id: 'a', displayName: 'Ana', phone: '8095551111', email: null, documentId: null },
    { id: 'b', displayName: 'Ana Dos', phone: '8095551111', email: 'ana@example.com', documentId: null },
  ],
}

describe('DuplicateCustomersModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchDuplicateCustomers.mockResolvedValue({ groups: [group], totalGroups: 1 })
    mergeDuplicateCustomers.mockResolvedValue({ keptCustomerId: 'a', archivedCustomerIds: ['b'] })
    autoMergeDuplicateCustomers.mockResolvedValue({ mergedGroups: 1, archivedCustomers: 1, items: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('lista duplicados y permite merge manual y automático', async () => {
    render(<DuplicateCustomersModal open onClose={() => {}} />)
    expect(await screen.findByTestId('clientes-duplicates-modal')).toBeTruthy()
    expect(await screen.findByText('Ana Dos')).toBeTruthy()
    fireEvent.click(screen.getByTestId('clientes-duplicates-merge-0'))
    await waitFor(() => {
      expect(mergeDuplicateCustomers).toHaveBeenCalledWith({
        customerIds: ['a', 'b'],
        keepCustomerId: 'a',
      })
    })
    fireEvent.click(screen.getByTestId('clientes-duplicates-auto-merge'))
    await waitFor(() => {
      expect(autoMergeDuplicateCustomers).toHaveBeenCalled()
    })
  })

  it('muestra estado vacío cuando no hay grupos', async () => {
    fetchDuplicateCustomers.mockResolvedValue({ groups: [], totalGroups: 0 })
    render(<DuplicateCustomersModal open onClose={() => {}} />)
    expect(await screen.findByText('Sin duplicados')).toBeTruthy()
  })
})
