// Central endpoint registry (placeholders). Grouped by module so new verticals
// can drop in their own map without touching callers.
export const ENDPOINTS = {
  dashboard: {
    summary: '/dashboard/summary',
    salesTrend: '/dashboard/sales-trend',
    stockAlerts: '/dashboard/stock-alerts',
    activity: '/dashboard/activity',
    appointments: '/dashboard/appointments',
  },
  pos: {
    products: '/pos/products',
    categories: '/pos/categories',
    branches: '/pos/branches',
    customers: '/pos/customers',
    checkout: '/pos/checkout',
    expense: '/pos/expense',
    closeRegister: '/pos/close-register',
  },
}

export default ENDPOINTS
