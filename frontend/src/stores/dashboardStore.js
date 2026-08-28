import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { KPIS, SALES_TREND, STOCK_ALERTS, RECENT_ACTIVITY, APPOINTMENTS_TODAY } from '@/data/dashboard'

// Dashboard store. Holds the persistent period filter + derived mock data.
export const useDashboardStore = create(
  persist(
    (set, get) => ({
      period: 'week', // today | week | month | quarter
      branchId: 'all',
      loading: false,
      setPeriod: (period) => set({ period }),
      setBranchId: (branchId) => set({ branchId }),
      getKpis: () => KPIS[get().period] || KPIS.week,
      getSalesTrend: () => SALES_TREND[get().period] || SALES_TREND.week,
      stockAlerts: STOCK_ALERTS,
      activity: RECENT_ACTIVITY,
      appointments: APPOINTMENTS_TODAY,
    }),
    {
      name: 'diedo-dashboard',
      version: 1,
      migrate: (persisted) => ({
        period: persisted?.period ?? 'week',
        branchId: persisted?.branchId ?? 'all',
      }),
      partialize: (s) => ({ period: s.period, branchId: s.branchId }),
    }
  )
)
