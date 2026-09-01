// Central endpoint registry (placeholders). Grouped by module so new verticals
// can drop in their own map without touching callers.
export const ENDPOINTS = {
  dashboard: {
    summary: '/api/v1/dashboard/summary',
    salesTrend: '/api/v1/dashboard/sales-trend',
    stockAlerts: '/api/v1/dashboard/stock-alerts',
    activity: '/api/v1/dashboard/activity',
    appointments: '/api/v1/dashboard/appointments',
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
