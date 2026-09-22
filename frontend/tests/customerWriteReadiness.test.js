import { beforeEach, describe, expect, it, vi } from 'vitest'
import { customersGateway, masterDataApi } from '@/services/masterDataApi'
import { useCustomersStore } from '@/stores/customersStore'
import { useSessionStore } from '@/stores/sessionStore'

const customerId = '11111111-1111-4111-8111-111111111111'
const branchId = '22222222-2222-4222-8222-222222222222'
const apiCustomer = (name, version) => ({
  id: customerId,
  customerType: 'business',
  displayName: name,
  businessName: name,
  phone: null,
  email: null,
  branches: [{ id: branchId }],
  status: 'active',
  version,
})

describe('guardado de clientes del CRM Simplificado', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    customersGateway.clear()
    useSessionStore.setState({ status: 'online', user: { branchIds: [branchId] } })
    useCustomersStore.getState().clearSensitive()
  })

  it('permite PATCH después de cargar una página desde API y conserva el nombre al recargar', async () => {
    const read = vi.spyOn(masterDataApi, 'customersPage').mockResolvedValue({
      items: [apiCustomer('Nombre anterior', 1)], page: 1, pageSize: 25,
      totalItems: 1, totalPages: 1,
    })
    const update = vi.spyOn(masterDataApi, 'updateCustomer').mockResolvedValue(
      apiCustomer('Nombre corregido', 2)
    )

    await useCustomersStore.getState().fetchCustomersPage({ page: 1 })
    expect(customersGateway.getState()).toMatchObject({ status: 'ready', source: 'api' })
    await useCustomersStore.getState().updateCustomer(customerId, { name: 'Nombre corregido' })
    expect(update).toHaveBeenCalledWith(customerId, expect.objectContaining({
      displayName: 'Nombre corregido', version: 1,
    }))
    read.mockResolvedValue({
      items: [apiCustomer('Nombre corregido', 2)], page: 1, pageSize: 25,
      totalItems: 1, totalPages: 1,
    })
    await useCustomersStore.getState().fetchCustomersPage({ page: 1 })
    expect(useCustomersStore.getState().customers.find((item) => item.id === customerId)?.name)
      .toBe('Nombre corregido')
  })

  it('carga por ID al cliente de un lead convertido antes de abrir su edición', async () => {
    vi.spyOn(masterDataApi, 'customer').mockResolvedValue(apiCustomer('Cliente convertido', 5))
    const customer = await useCustomersStore.getState().fetchCustomer(customerId)
    expect(masterDataApi.customer).toHaveBeenCalledWith(customerId)
    expect(customer).toMatchObject({ id: customerId, name: 'Cliente convertido', version: 5 })
    expect(useCustomersStore.getState().customers.find((item) => item.id === customerId)).toMatchObject({
      name: 'Cliente convertido', version: 5,
    })
    expect(customersGateway.getState()).toMatchObject({ status: 'ready', source: 'api' })
  })

  it('bloquea PATCH si la lectura falla y expone el error real', async () => {
    const update = vi.spyOn(masterDataApi, 'updateCustomer').mockResolvedValue(apiCustomer('Nuevo', 2))
    vi.spyOn(masterDataApi, 'customersPage').mockRejectedValue(new Error('API sin conexión'))
    await expect(useCustomersStore.getState().fetchCustomersPage({ page: 1 }))
      .rejects.toThrow('API sin conexión')
    expect(useCustomersStore.getState().dataState.status).toBe('error')
    await expect(customersGateway.mutate('updateCustomer', customerId, {}))
      .rejects.toThrow('Las mutaciones están bloqueadas')
    expect(update).not.toHaveBeenCalled()
  })
})
