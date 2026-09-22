import { create } from 'zustand'

import { customersGateway, masterDataApi } from '@/services/masterDataApi'

import { useSessionStore } from '@/stores/sessionStore'

import {

  customerToApiPayload,

  mapCustomerFromApi,

  mapCustomerFromDemo,

  mapCustomersPaginatedFromApi,

} from '@/services/adapters/masterData'

import { registerSensitiveStateCleaner } from '@/services/storagePolicy'

import { DEFAULT_CRM_PAGE_SIZE, normalizeCrmPageSize } from '@/modules/crm/constants/paging'

import { buildCustomerListApiParams } from '@/modules/crm/lib/customerListParams'



export const WALK_IN_CUSTOMER = Object.freeze({

  id: 'walk-in',

  name: 'Cliente Mostrador',

  phone: null,

  isDefault: true,

  source: 'local-ui',

})



const genId = () => `cust-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`



const emptyCustomersListMeta = () => ({

  page: 0,

  pageSize: DEFAULT_CRM_PAGE_SIZE,

  totalPages: 0,

  totalItems: 0,

  loading: false,

  loadingMore: false,

  search: '',

  typeFilter: 'all',

  statusFilter: 'all',

  branchIds: [],

})



export const useCustomersStore = create((set, get) => ({

  customers: [WALK_IN_CUSTOMER],

  customersListMeta: emptyCustomersListMeta(),

  dataState: customersGateway.getState(),

  hydrating: false,



  hydrate: async ({ force = false, search = '' } = {}) => {

    const meta = get().customersListMeta

    const hasBaseline = meta.page >= 1 && meta.totalPages >= 1

    if (!force && !search && hasBaseline) {

      return get().customers

    }

    return get().fetchCustomersPage({

      page: 1,

      search,

      typeFilter: meta.typeFilter,

      statusFilter: meta.statusFilter,

      branchIds: meta.branchIds,

    })

  },

  fetchCustomer: async (id) => {
    if (useSessionStore.getState().status === 'demo') {
      return get().customers.find((customer) => customer.id === id) || null
    }
    const { data } = await customersGateway.read('customer', id)
    const customer = mapCustomerFromApi(data)
    set((state) => ({
      customers: state.customers.some((item) => item.id === id)
        ? state.customers.map((item) => (item.id === id ? customer : item))
        : [...state.customers, customer],
      dataState: customersGateway.getState(),
    }))
    return customer
  },



  fetchCustomersPage: async ({

    page = 1,

    pageSize,

    search,

    typeFilter,

    statusFilter,

    branchIds,

  } = {}) => {

    const meta = get().customersListMeta

    const targetPage = Math.max(1, page)

    const targetSize = normalizeCrmPageSize(pageSize ?? meta.pageSize)

    const searchKey = search ?? meta.search ?? ''

    const typeKey = typeFilter ?? meta.typeFilter ?? 'all'

    const statusKey = statusFilter ?? meta.statusFilter ?? 'all'

    const branchKey = branchIds ?? meta.branchIds ?? []



    if (get().hydrating && meta.loading) return get().customers



    set({

      hydrating: true,

      customersListMeta: {

        ...meta,

        page: targetPage,

        pageSize: targetSize,

        search: searchKey,

        typeFilter: typeKey,

        statusFilter: statusKey,

        branchIds: branchKey,

        loading: true,

        loadingMore: false,

      },

      dataState: {

        status: 'loading',

        source: 'api',

        error: null,

      },

    })



    try {

      if (useSessionStore.getState().status === 'demo') {

        const result = await customersGateway.read('customers')

        const mapper = result.source === 'demo' ? mapCustomerFromDemo : mapCustomerFromApi

        const customers = [WALK_IN_CUSTOMER, ...result.data.map(mapper)]

        set({

          customers,

          customersListMeta: {

            page: 1,

            pageSize: targetSize,

            totalPages: 1,

            totalItems: Math.max(0, customers.length - 1),

            loading: false,

            loadingMore: false,

            search: searchKey,

            typeFilter: typeKey,

            statusFilter: statusKey,

            branchIds: branchKey,

          },

          dataState: customersGateway.getState(),

          hydrating: false,

        })

        return customers

      }



      const { data: response } = await customersGateway.read('customersPage',

        buildCustomerListApiParams({

          page: targetPage,

          pageSize: targetSize,

          search: searchKey,

          typeFilter: typeKey,

          statusFilter: statusKey,

          branchIds: branchKey,

        }),

      )

      const mapped = mapCustomersPaginatedFromApi(response)

      set({

        customers: [WALK_IN_CUSTOMER, ...mapped.items],

        customersListMeta: {

          page: mapped.page,

          pageSize: targetSize,

          totalPages: mapped.totalPages,

          totalItems: mapped.totalItems,

          loading: false,

          loadingMore: false,

          search: searchKey,

          typeFilter: typeKey,

          statusFilter: statusKey,

          branchIds: branchKey,

        },

        dataState: customersGateway.getState(),

        hydrating: false,

      })

      return get().customers

    } catch (error) {

      set({

        dataState: customersGateway.getState(),

        hydrating: false,

        customersListMeta: { ...get().customersListMeta, loading: false, loadingMore: false },

      })

      throw error

    }

  },



  setCustomersPage: (page) => {

    const meta = get().customersListMeta

    return get().fetchCustomersPage({

      page,

      pageSize: meta.pageSize,

      search: meta.search,

      typeFilter: meta.typeFilter,

      statusFilter: meta.statusFilter,

      branchIds: meta.branchIds,

    })

  },



  setCustomersPageSize: (pageSize) => {

    const meta = get().customersListMeta

    return get().fetchCustomersPage({

      page: 1,

      pageSize,

      search: meta.search,

      typeFilter: meta.typeFilter,

      statusFilter: meta.statusFilter,

      branchIds: meta.branchIds,

    })

  },



  /** @deprecated Scroll infinito sustituido por paginación */

  loadMoreCustomers: () => get().setCustomersPage(get().customersListMeta.page + 1),



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



  deleteCustomers: async (customerIds) => {

    const ids = [...new Set((customerIds || []).filter((id) => id && id !== 'walk-in'))]

    if (!ids.length) return { items: [] }

    if (useSessionStore.getState().status === 'demo') {

      set((state) => ({

        customers: state.customers.filter((customer) => !ids.includes(customer.id)),

        customersListMeta: {

          ...state.customersListMeta,

          totalItems: Math.max(0, state.customersListMeta.totalItems - ids.length),

        },

      }))

      return { items: ids.map((customerId) => ({ customerId, status: 'deleted' })) }

    }

    const response = await masterDataApi.deleteCustomersBatch({ customerIds: ids })

    const deletedIds = new Set(

      (response.items || []).filter((row) => row.status === 'deleted').map((row) => row.customerId),

    )

    if (deletedIds.size) {

      const meta = get().customersListMeta

      set((state) => ({

        customers: state.customers.filter((customer) => !deletedIds.has(customer.id)),

        customersListMeta: {

          ...state.customersListMeta,

          totalItems: Math.max(0, state.customersListMeta.totalItems - deletedIds.size),

        },

      }))

      if (get().customers.filter((c) => c.id !== 'walk-in').length === 0 && meta.page > 1) {

        await get().setCustomersPage(Math.max(1, meta.page - 1))

      }

    }

    return response

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



  mergeCrmProfiles: (crmCustomers) => set((state) => {

    const crmById = new Map(crmCustomers.map((customer) => [customer.id, customer]))

    const merged = state.customers.map((customer) => {

      const crmCustomer = crmById.get(customer.id)

      return crmCustomer ? { ...customer, ...crmCustomer } : customer

    })

    return { customers: merged }

  }),



  clearSensitive: () => set({

    customers: [WALK_IN_CUSTOMER],

    customersListMeta: emptyCustomersListMeta(),

    dataState: customersGateway.getState(),

    hydrating: false,

  }),

}))



registerSensitiveStateCleaner(() => useCustomersStore.getState().clearSensitive())

