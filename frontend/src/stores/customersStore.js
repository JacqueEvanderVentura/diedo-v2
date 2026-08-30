import { create } from 'zustand'
import { customersGateway } from '@/services/masterDataApi'
import { useSessionStore } from '@/stores/sessionStore'
import {
  customerToApiPayload,
  mapCustomerFromApi,
  mapCustomerFromDemo,
} from '@/services/adapters/masterData'
import { registerSensitiveStateCleaner } from '@/services/storagePolicy'

export const WALK_IN_CUSTOMER = Object.freeze({
  id: 'walk-in',
  name: 'Cliente Mostrador',
  phone: null,
  isDefault: true,
  source: 'local-ui',
})

const genId = () => `cust-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export const useCustomersStore = create((set, get) => ({
  customers: [WALK_IN_CUSTOMER],
  dataState: customersGateway.getState(),
  hydrating: false,

  hydrate: async ({ force = false } = {}) => {
    if (get().hydrating || (!force && get().dataState.status !== 'loading')) return get().customers
    set({ hydrating: true })
    try {
      const result = await customersGateway.read('customers')
      const mapper = result.source === 'demo' ? mapCustomerFromDemo : mapCustomerFromApi
      const customers = [WALK_IN_CUSTOMER, ...result.data.map(mapper)]
      set({ customers, dataState: customersGateway.getState(), hydrating: false })
      return customers
    } catch (error) {
      set({ dataState: customersGateway.getState(), hydrating: false })
      throw error
    }
  },

  addCustomer: async (data) => {
    if (useSessionStore.getState().status === 'demo') {
      const customer = { id: data.id || genId(), status: 'active', active: true, ...data, source: 'demo' }
      set((state) => ({ customers: [customer, ...state.customers] }))
      return customer
    }
    const branchIds = useSessionStore.getState().user?.branchIds || []
    const response = await customersGateway.mutate(
      'createCustomer',
      customerToApiPayload(data, branchIds)
    )
    const customer = mapCustomerFromApi(response)
    set((state) => ({ customers: [customer, ...state.customers] }))
    return customer
  },

  updateCustomer: async (id, data) => {
    const current = get().customers.find((customer) => customer.id === id)
    if (!current) throw new Error('Cliente no encontrado.')
    if (useSessionStore.getState().status === 'demo') {
      const customer = { ...current, ...data, source: 'demo' }
      set((state) => ({
        customers: state.customers.map((item) => (item.id === id ? customer : item)),
      }))
      return customer
    }
    const payload = customerToApiPayload({ ...current, ...data })
    const response = await customersGateway.mutate('updateCustomer', id, {
      ...payload,
      version: current.version,
    })
    const customer = mapCustomerFromApi(response)
    set((state) => ({
      customers: state.customers.map((item) => (item.id === id ? customer : item)),
    }))
    return customer
  },

  clearSensitive: () => set({
    customers: [WALK_IN_CUSTOMER],
    dataState: customersGateway.getState(),
    hydrating: false,
  }),
}))

registerSensitiveStateCleaner(() => useCustomersStore.getState().clearSensitive())
