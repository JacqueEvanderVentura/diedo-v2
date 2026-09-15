import { useSessionStore } from '@/stores/sessionStore'

export function useCrmCapabilities() {
  const session = useSessionStore()
  const can = (code) => session.status === 'demo' || session.hasPermission(code)
  return {
    manage: can('crm.manage'),
    convert: can('crm.manage') && can('customer.manage'),
    quote: can('crm.manage') && can('sales.quote.manage'),
    customer: can('customer.manage'),
    schedule: can('appointment.manage'),
  }
}
