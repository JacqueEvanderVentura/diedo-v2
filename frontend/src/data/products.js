// Mock catalog for the POS terminal. Prices in RD.
export const BRANCHES = [
  { id: 'charm-dn', name: 'Charm DN' },
  { id: 'charm-santiago', name: 'Charm Santiago' },
  { id: 'charm-este', name: 'Charm Este' },
]

export const CATEGORIES = [
  { id: 'all', name: 'Todos' },
  { id: 'depto-laser', name: 'Depto laser' },
  { id: 'laser', name: 'Laser' },
  { id: 'otros', name: 'Otros' },
  { id: 'ventas', name: 'Ventas' },
  { id: 'productos', name: 'Productos' },
]

export const PRODUCTS = [
  { id: 'p1', sku: '10', name: '50% Restante de Ciclo', price: 8000, category: 'depto-laser', type: 'service', branchIds: ['charm-dn'] },
  { id: 'p2', sku: '8', name: '1 sesión axilas', price: 900, category: 'laser', type: 'service', branchIds: ['charm-dn'] },
  { id: 'p3', sku: null, name: 'Membresía Charm', price: 1000, category: 'otros', type: 'service', branchIds: ['charm-dn'] },
  { id: 'p4', sku: '9', name: '1 sesión piernas completas', price: 1200, category: 'laser', type: 'service', branchIds: ['charm-santiago'] },
  { id: 'p5', sku: '3', name: 'Paq. 12 sesiones Brasileño (íntimo)', price: 5500, category: 'depto-laser', type: 'service', branchIds: ['charm-dn'] },
  { id: 'p6', sku: '6', name: 'Paq. 12 sesiones Rostro completo', price: 5000, category: 'depto-laser', type: 'service', branchIds: ['charm-dn'] },
  { id: 'p7', sku: '10b', name: 'Paq 12 sesiones cuerpo completo', price: 9100, category: 'depto-laser', type: 'service', branchIds: ['charm-dn'] },
  { id: 'p8', sku: '26', name: '1 Sesión rostro', price: 700, category: 'laser', type: 'service', branchIds: ['charm-este'] },
  { id: 'p9', sku: '5', name: 'Paq. 12 sesiones - Cuerpo completo VIP', price: 23000, category: 'depto-laser', type: 'service', branchIds: ['charm-dn'] },
  { id: 'p10', sku: '25', name: '50% Paquete de 2 Cuerpos Completos', price: 12000, category: 'ventas', type: 'service', branchIds: ['charm-dn'] },
  { id: 'p11', sku: '2', name: 'Facial hidratante', price: 2500, category: 'otros', type: 'service', branchIds: ['charm-santiago'] },
  { id: 'p12', sku: '12', name: 'Depilación bigote', price: 500, category: 'laser', type: 'service', branchIds: ['charm-este'] },
  { id: 'p13', sku: 'PRD-01', name: 'Crema de leche', price: 350, category: 'productos', type: 'product', stock: 0 },
  { id: 'p14', sku: 'PRD-02', name: 'Red Bull', price: 180, category: 'productos', type: 'product', stock: 0 },
  { id: 'p15', sku: 'PRD-03', name: 'Coca cola normal', price: 90, category: 'productos', type: 'product', stock: 0 },
  { id: 'p16', sku: 'PRD-04', name: 'Hamburguesa', price: 420, category: 'productos', type: 'product', stock: 0 },
  { id: 'p17', sku: 'PRD-05', name: 'Serum vitamina C', price: 1350, category: 'productos', type: 'product', stock: 24 },
  { id: 'p18', sku: 'PRD-06', name: 'Bloqueador solar SPF50', price: 890, category: 'productos', type: 'product', stock: 12 },
]

// Insumos / materia prima — no se venden en POS (coste de adquisición, stock).
export const SUPPLIES = [
  { id: 'sup-1', sku: 'INS-01', name: 'Guantes de nitrilo (caja)', cost: 450, stock: 120, minStock: 20, category: 'insumos', type: 'supply', unit: 'caja', branchId: 'charm-dn' },
  { id: 'sup-2', sku: 'INS-02', name: 'Gel conductor láser', cost: 850, stock: 45, minStock: 10, category: 'insumos', type: 'supply', unit: 'lt', branchId: 'charm-dn' },
  { id: 'sup-3', sku: 'INS-03', name: 'Toallas desechables (paquete)', cost: 320, stock: 80, minStock: 15, category: 'insumos', type: 'supply', unit: 'paq', branchId: 'charm-dn' },
  { id: 'sup-4', sku: 'INS-04', name: 'Alcohol isopropílico 70%', cost: 280, stock: 36, minStock: 8, category: 'insumos', type: 'supply', unit: 'lt', branchId: 'charm-dn' },
]

export const PAYMENT_METHODS = [
  { id: 'efectivo', name: 'Efectivo', icon: 'Banknote' },
  { id: 'tarjeta', name: 'Tarjeta', icon: 'CreditCard' },
  { id: 'transferencia', name: 'Transferencia', icon: 'ArrowLeftRight' },
  { id: 'link', name: 'Link', icon: 'Link2' },
  { id: 'cxc', name: 'Cta. Cobrar', icon: 'Clock' },
]
