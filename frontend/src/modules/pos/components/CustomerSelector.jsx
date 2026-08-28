import { usePosStore } from '@/stores/posStore'
import { CustomerPicker } from '@/components/customers/CustomerPicker'

export function CustomerSelector() {
  const customer = usePosStore((s) => s.customer)
  const setCustomer = usePosStore((s) => s.setCustomer)

  return (
    <CustomerPicker
      value={customer}
      onChange={setCustomer}
      testIdPrefix="pos-customer"
    />
  )
}
