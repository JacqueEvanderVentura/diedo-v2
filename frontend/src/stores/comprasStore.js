import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

const SEED_SUPPLIERS = [
  { id: 'sup-1', name: 'Distribuidora del Caribe', rnc: '131-12345-6', contactName: 'Juan Pérez', phone: '809-555-0199', email: 'ventas@proveedor.com', address: 'Calle Central #12, Santo Domingo', branchIds: ['charm-dn', 'charm-santiago'], productCount: 24, active: true, createdAt: daysAgo(60) },
  { id: 'sup-2', name: 'Beauty Supply RD', rnc: '101-99887-2', contactName: 'María López', phone: '829-555-4400', email: 'pedidos@beautysupply.do', address: 'Av. Winston Churchill, SD', branchIds: ['charm-dn'], productCount: 12, active: true, createdAt: daysAgo(30) },
]

const SEED_REQUESTS = [
  {
    id: 'req-1',
    supplierId: 'sup-1',
    branchId: 'charm-dn',
    requesterName: 'Leonedis Hamburgo',
    requesterId: 'u1',
    items: [
      { name: 'Cera depilatoria premium', qty: 10, unit: 'unidad', price: 450 },
      { name: 'Guantes desechables', qty: 5, unit: 'caja', price: 320 },
    ],
    status: 'pendiente',
    priority: 'normal',
    notes: 'Reposición mensual de insumos láser.',
    quoteFile: null,
    createdAt: daysAgo(1),
    reviewedAt: null,
    reviewedBy: null,
  },
  {
    id: 'req-2',
    supplierId: 'sup-2',
    branchId: 'charm-dn',
    requesterName: 'María Recepción',
    requesterId: 'u2',
    items: [{ name: 'Shampoo profesional', qty: 20, unit: 'unidad', price: 280 }],
    status: 'aprobada',
    priority: 'alta',
    notes: 'Urgente para sucursal DN.',
    quoteFile: { name: 'cotizacion-shampoo.pdf' },
    createdAt: daysAgo(4),
    reviewedAt: daysAgo(3),
    reviewedBy: 'u1',
  },
]

function requestTotal(req) {
  return (req.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0)
}

export const useComprasStore = create(
  persist(
    (set, get) => ({
      suppliers: SEED_SUPPLIERS,
      purchaseRequests: SEED_REQUESTS,
      settings: { approverUserId: 'u1', notifyOnRequest: true },

      addSupplier: (data) => {
        const supplier = {
          id: genId('sup'),
          productCount: 0,
          active: true,
          createdAt: now(),
          branchIds: [],
          ...data,
        }
        set((s) => ({ suppliers: [supplier, ...s.suppliers] }))
        return supplier
      },

      updateSupplier: (id, data) =>
        set((s) => ({
          suppliers: s.suppliers.map((sup) => (sup.id === id ? { ...sup, ...data } : sup)),
        })),

      deleteSupplier: (id) =>
        set((s) => ({ suppliers: s.suppliers.filter((sup) => sup.id !== id) })),

      addPurchaseRequest: (data) => {
        const req = {
          id: genId('req'),
          status: 'pendiente',
          priority: 'normal',
          quoteFile: null,
          createdAt: now(),
          reviewedAt: null,
          reviewedBy: null,
          ...data,
        }
        set((s) => ({ purchaseRequests: [req, ...s.purchaseRequests] }))
        return req
      },

      updatePurchaseRequest: (id, data) =>
        set((s) => ({
          purchaseRequests: s.purchaseRequests.map((r) => (r.id === id ? { ...r, ...data } : r)),
        })),

      reviewPurchaseRequest: (id, status, reviewerId) =>
        set((s) => ({
          purchaseRequests: s.purchaseRequests.map((r) =>
            r.id === id ? { ...r, status, reviewedAt: now(), reviewedBy: reviewerId } : r
          ),
        })),

      markRequestDelivered: (id) =>
        set((s) => ({
          purchaseRequests: s.purchaseRequests.map((r) =>
            r.id === id ? { ...r, status: 'entregada', deliveredAt: now() } : r
          ),
        })),

      updateSettings: (data) => set((s) => ({ settings: { ...s.settings, ...data } })),

      getRequestStats: () => {
        const reqs = get().purchaseRequests
        return {
          total: reqs.length,
          pendiente: reqs.filter((r) => r.status === 'pendiente').length,
          aprobada: reqs.filter((r) => r.status === 'aprobada').length,
          entregada: reqs.filter((r) => r.status === 'entregada').length,
        }
      },

      getRequestTotal: requestTotal,
    }),
    { name: 'diedo-compras' }
  )
)

export { requestTotal }
