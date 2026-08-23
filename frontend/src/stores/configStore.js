import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BRANCHES, CATEGORIES, PAYMENT_METHODS } from '@/data/products'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export const USER_ROLES = ['Administrador', 'Gerente', 'Cajero', 'Recepción']

const SEED_BRANCHES = BRANCHES.map((b) => ({ ...b, active: true }))
const SEED_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'all')
const SEED_METHODS = PAYMENT_METHODS.map((m) => ({ ...m, enabled: true, core: true }))
const SEED_USERS = [
  { id: 'u1', name: 'Leonedis Hamburgo', email: 'leonedis@charm.do', role: 'Gerente', active: true },
  { id: 'u2', name: 'María Recepción', email: 'maria@charm.do', role: 'Recepción', active: true },
  { id: 'u3', name: 'Carlos Cajero', email: 'carlos@charm.do', role: 'Cajero', active: true },
  { id: 'u4', name: 'Admin Charm', email: 'admin@charm.do', role: 'Administrador', active: false },
]
const SEED_SETTINGS = { businessName: 'Diedo App', taxDefault: 18, region: 'República Dominicana', currency: 'DOP$' }

export const useConfigStore = create(
  persist(
    (set) => ({
      branches: SEED_BRANCHES,
      categories: SEED_CATEGORIES,
      paymentMethods: SEED_METHODS,
      users: SEED_USERS,
      settings: SEED_SETTINGS,

      // ---- branches ----
      addBranch: (name) => set((s) => ({ branches: [...s.branches, { id: genId('br'), name, active: true }] })),
      updateBranch: (id, data) => set((s) => ({ branches: s.branches.map((b) => (b.id === id ? { ...b, ...data } : b)) })),
      deleteBranch: (id) => set((s) => (s.branches.length <= 1 ? {} : { branches: s.branches.filter((b) => b.id !== id) })),

      // ---- categories ----
      addCategory: (name) => set((s) => ({ categories: [...s.categories, { id: genId('cat'), name }] })),
      updateCategory: (id, name) => set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)) })),
      deleteCategory: (id) => set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),

      // ---- payment methods ----
      addPaymentMethod: (name) => set((s) => ({ paymentMethods: [...s.paymentMethods, { id: genId('pm'), name, icon: 'Wallet', enabled: true, core: false }] })),
      togglePaymentMethod: (id) => set((s) => ({ paymentMethods: s.paymentMethods.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)) })),
      deletePaymentMethod: (id) => set((s) => ({ paymentMethods: s.paymentMethods.filter((m) => m.id !== id || m.core) })),

      // ---- users ----
      addUser: (data) => set((s) => ({ users: [{ id: genId('u'), active: true, ...data }, ...s.users] })),
      updateUser: (id, data) => set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...data } : u)) })),
      deleteUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),

      // ---- settings ----
      updateSettings: (data) => set((s) => ({ settings: { ...s.settings, ...data } })),
    }),
    { name: 'diedo-config' }
  )
)
