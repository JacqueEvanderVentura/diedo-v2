import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'
import { BRANCHES, CATEGORIES, PAYMENT_METHODS } from '@/data/products'
import { PERMISSION_MODULES, buildDefaultMatrix, USER_ROLES } from '@/data/permisos'
import { DEFAULT_WHATSAPP_TEMPLATES } from '@/data/whatsappTemplates'
import { newPasswordError } from '@/lib/passwordPolicy'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export { USER_ROLES }

export const CATEGORY_TYPES = [
  { id: 'producto', name: 'Producto' },
  { id: 'gasto', name: 'Gasto' },
  { id: 'ingreso', name: 'Ingreso' },
]

export const CATEGORY_COLORS = [
  { id: 'indigo', bg: '#e0e7ff', fg: '#4338ca' },
  { id: 'violet', bg: '#ede9fe', fg: '#6d28d9' },
  { id: 'pink', bg: '#fce7f3', fg: '#be185d' },
  { id: 'rose', bg: '#ffe4e6', fg: '#e11d48' },
  { id: 'amber', bg: '#fef3c7', fg: '#d97706' },
  { id: 'emerald', bg: '#d1fae5', fg: '#059669' },
  { id: 'teal', bg: '#ccfbf1', fg: '#0d9488' },
  { id: 'sky', bg: '#e0f2fe', fg: '#0284c7' },
]

const branchDefaults = {
  address: '',
  phone: '',
  email: '',
  manager: '',
  schedule: '09:00 - 21:00',
  active: true,
  independentBusiness: false,
  legalName: '',
  rnc: '',
  partners: [],
}

const SEED_BRANCHES = [
  {
    id: 'charm-dn',
    name: 'Charm DN',
    ...branchDefaults,
    address: 'Av. Winston Churchill, Santo Domingo',
    phone: '+1 809 555 0101',
    email: 'charmdn@charm.do',
    legalName: 'Charm Esthetic Clinic SRL',
    rnc: '1-3290890-2',
    partners: [{ name: 'Leonedis Hamburgo', share: 60 }],
  },
  {
    id: 'charm-santiago',
    name: 'Charm Santiago',
    ...branchDefaults,
    address: 'Av. Estrella Sadhalá, Santiago',
    phone: '+1 809 555 0102',
    email: 'charmsantiago@charm.do',
    legalName: 'Charm Esthetic Clinic SRL',
    partners: [{ name: 'Socio Santiago', share: 100 }],
  },
  {
    id: 'charm-este',
    name: 'Charm Este',
    ...branchDefaults,
    address: 'Av. Las Américas, Santo Domingo Este',
    independentBusiness: true,
    legalName: 'Charm Este SRL',
    partners: [{ name: 'Evander Jean Paul', share: 50 }, { name: 'Socio Este', share: 50 }],
  },
]

const SEED_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'all').map((c, i) => ({
  id: c.id,
  name: c.name,
  description: '',
  type: 'producto',
  color: CATEGORY_COLORS[i % CATEGORY_COLORS.length].id,
  active: true,
}))

const SEED_METHODS = PAYMENT_METHODS.map((m) => ({ ...m, enabled: true, core: true }))

const SEED_USERS = [
  { id: 'u1', name: 'Alex Demo', email: 'alex.admin.demo@example.test', role: 'Administrador', active: true, branchIds: ['charm-dn', 'charm-santiago', 'charm-este'], lastAccess: null },
  { id: 'u2', name: 'Mar Demo', email: 'mar.manager.demo@example.test', role: 'Supervisor', active: true, branchIds: ['charm-dn'], lastAccess: null },
  { id: 'u3', name: 'Sol Demo', email: 'sol.cashier.demo@example.test', role: 'Cajero', active: true, branchIds: ['charm-dn'], lastAccess: null },
]

const SEED_SETTINGS = { businessName: 'Diedo App', taxDefault: 18, region: 'República Dominicana', currency: 'RD$' }

function normalizeBranch(data) {
  return {
    ...branchDefaults,
    ...data,
    name: data.name?.trim() || '',
    partners: Array.isArray(data.partners) ? data.partners : [],
  }
}

function normalizeCategory(data) {
  return {
    description: '',
    type: 'producto',
    color: CATEGORY_COLORS[0].id,
    active: true,
    ...data,
    name: data.name?.trim() || '',
  }
}

export const useConfigStore = create(
  persist(
    (set, get) => ({
      branches: SEED_BRANCHES,
      categories: SEED_CATEGORIES,
      paymentMethods: SEED_METHODS,
      users: SEED_USERS,
      settings: SEED_SETTINGS,
      permissions: buildDefaultMatrix(),
      whatsappTemplates: structuredClone(DEFAULT_WHATSAPP_TEMPLATES),

      // ---- branches ----
      setBranches: (branches) => set({ branches: branches.map(normalizeBranch) }),
      addBranch: (data) =>
        set((s) => ({
          branches: [...s.branches, { id: genId('br'), ...normalizeBranch(data) }],
        })),
      updateBranch: (id, data) =>
        set((s) => ({
          branches: s.branches.map((b) => (b.id === id ? normalizeBranch({ ...b, ...data }) : b)),
        })),
      deleteBranch: (id) =>
        set((s) => (s.branches.length <= 1 ? {} : { branches: s.branches.filter((b) => b.id !== id) })),

      // ---- categories ----
      addCategory: (data) =>
        set((s) => ({
          categories: [...s.categories, { id: genId('cat'), ...normalizeCategory(data) }],
        })),
      updateCategory: (id, data) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? normalizeCategory({ ...c, ...data }) : c)),
        })),
      deleteCategory: (id) => set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),
      setCategories: (categories) => set({ categories }),

      // ---- payment methods ----
      addPaymentMethod: (name) =>
        set((s) => ({
          paymentMethods: [...s.paymentMethods, { id: genId('pm'), name, icon: 'Wallet', enabled: true, core: false }],
        })),
      setPaymentMethods: (paymentMethods) => set({ paymentMethods }),
      resetPaymentMethods: () => set({ paymentMethods: structuredClone(SEED_METHODS) }),
      togglePaymentMethod: (id) =>
        set((s) => ({
          paymentMethods: s.paymentMethods.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
        })),
      deletePaymentMethod: (id) =>
        set((s) => ({ paymentMethods: s.paymentMethods.filter((m) => m.id !== id || m.core) })),

      // ---- users ----
      addUser: ({ password: _password, ...data }) =>
        set((s) => ({
          users: [
            {
              id: genId('u'),
              active: true,
              branchIds: [],
              lastAccess: null,
              ...data,
            },
            ...s.users,
          ],
        })),
      updateUser: (id, data) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, ...data } : u)),
        })),
      deleteUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),

      changeOwnPassword: (userId, _currentPassword, newPassword) => {
        const user = get().users.find((u) => u.id === userId)
        if (!user) return { ok: false, error: 'Usuario no encontrado.' }
        const policyError = newPasswordError(newPassword)
        if (policyError) return { ok: false, error: policyError }
        return { ok: true }
      },

      updateOwnProfile: (userId, data) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, ...data } : u)),
        })),

      // ---- settings ----
      updateSettings: (data) => set((s) => ({ settings: { ...s.settings, ...data } })),

      // ---- whatsapp templates ----
      updateWhatsappTemplates: (context, templates) =>
        set((s) => ({
          whatsappTemplates: { ...s.whatsappTemplates, [context]: templates },
        })),
      updateWhatsappTemplateBody: (context, templateId, body) =>
        set((s) => ({
          whatsappTemplates: {
            ...s.whatsappTemplates,
            [context]: (s.whatsappTemplates[context] || []).map((t) =>
              t.id === templateId ? { ...t, body } : t
            ),
          },
        })),

      // ---- permissions ----
      togglePermission: (actionId, role) =>
        set((s) => ({
          permissions: {
            ...s.permissions,
            [actionId]: { ...s.permissions[actionId], [role]: !s.permissions[actionId]?.[role] },
          },
        })),
      resetPermissions: () => set({ permissions: buildDefaultMatrix() }),
      getPermissionSummary: () => {
        const { permissions } = get()
        const total = PERMISSION_MODULES.reduce((a, m) => a + m.actions.length, 0)
        return USER_ROLES.map((role) => {
          const granted = Object.values(permissions).filter((row) => row[role]).length
          return { role, granted, total, pct: total ? Math.round((granted / total) * 100) : 0 }
        })
      },
    }),
    {
      name: 'diedo-config',
      storage: ephemeralJsonStorage,
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        const defaults = buildDefaultMatrix()
        const merged = { ...defaults, ...(state.permissions || {}) }
        Object.keys(defaults).forEach((id) => {
          merged[id] = { ...defaults[id], ...(state.permissions?.[id] || {}) }
        })
        state.permissions = merged
        if (!state.whatsappTemplates) {
          state.whatsappTemplates = structuredClone(DEFAULT_WHATSAPP_TEMPLATES)
        } else {
          const mergedWa = structuredClone(DEFAULT_WHATSAPP_TEMPLATES)
          Object.keys(mergedWa).forEach((ctx) => {
            const saved = state.whatsappTemplates[ctx]
            if (Array.isArray(saved) && saved.length) mergedWa[ctx] = saved
          })
          state.whatsappTemplates = mergedWa
        }
        if (Array.isArray(state.users)) state.users = state.users.map(({ password: _password, ...user }) => user)
        return state
      },
    }
  )
)
