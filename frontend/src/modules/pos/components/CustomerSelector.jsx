import { useEffect } from 'react'
import { toast } from 'sonner'
import { usePosStore } from '@/stores/posStore'
import { WALK_IN_CUSTOMER } from '@/stores/customersStore'
import { CustomerPicker } from '@/components/customers/CustomerPicker'
import { customerActiveAtBranch } from '@/lib/customerScope'

export function CustomerSelector() {
  const branchId = usePosStore((s) => s.branchId)
  const customer = usePosStore((s) => s.customer)
  const setCustomer = usePosStore((s) => s.setCustomer)

  useEffect(() => {
    if (!branchId || customer?.isDefault || customer?.id === 'walk-in') return
    if (!customerActiveAtBranch(customer, branchId)) {
      setCustomer(WALK_IN_CUSTOMER)
      toast.info('El cliente anterior no aplica en esta sucursal. Se usó cliente mostrador.')
    }
  }, [branchId, customer, setCustomer])

  return (
    <CustomerPicker
      value={customer}
      onChange={setCustomer}
      branchId={branchId}
      testIdPrefix="pos-customer"
    />
  )
}
