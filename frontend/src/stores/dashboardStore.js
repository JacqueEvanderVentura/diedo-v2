import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { KPIS, SALES_TREND, STOCK_ALERTS, RECENT_ACTIVITY, APPOINTMENTS_TODAY } from '@/data/dashboard'

// Dashboard store. Holds the persistent period filter + derived mock data.
export const useDashboardStore = create(
  persist(
    (set, get) => ({
      period: 'week', // today | week | month | quarter
      loading: false,
      setPeriod: (period) => set({ period }),
      getKpis: () => KPIS[get().period] || KPIS.week,
      getSalesTrend: () => SALES_TREND[get().period] || SALES_TREND.week,
      stockAlerts: STOCK_ALERTS,
      activity: RECENT_ACTIVITY,
      appointments: APPOINTMENTS_TODAY,
    }),
    {
      name: 'diedo-dashboard',
      partialize: (s) => ({ period: s.period }),
    }
  )
)
