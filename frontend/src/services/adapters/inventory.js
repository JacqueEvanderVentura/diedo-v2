export function mapAssetCategoryFromApi(category) {
  return {
    id: category.code,
    apiId: category.id,
    name: category.name,
    status: category.status,
    version: category.version,
    apiSynced: true,
  }
}

export function mapAssetFromApi(asset) {
  return {
    id: asset.id,
    name: asset.name,
    code: asset.code,
    category: asset.category.code,
    categoryId: asset.category.id,
    value: Number(asset.acquisitionValue) || 0,
    status: asset.status,
    location: asset.location || '',
    branchId: asset.branch.id,
    purchaseDate: asset.purchaseDate || '',
    notes: asset.notes || '',
    version: asset.version,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    apiSynced: true,
  }
}

export function mapAssetSummaryFromApi(summary) {
  return {
    totalValue: Number(summary.totalValue) || 0,
    operativos: Number(summary.operational) || 0,
    reparacion: Number(summary.inRepair) || 0,
    baja: Number(summary.retired) || 0,
  }
}

export function assetToApiPayload(form, categories) {
  const category = categories.find(
    (item) => item.id === form.category || item.apiId === form.category
  )
  if (!category?.apiId) {
    throw new Error('Selecciona una categoría de activo sincronizada con la API.')
  }
  if (!form.branchId) {
    throw new Error('Selecciona una sucursal.')
  }

  return {
    name: form.name.trim(),
    code: form.code?.trim() || null,
    categoryId: category.apiId,
    branchId: form.branchId,
    acquisitionValue: Number(form.value) || 0,
    status: form.status || 'activo',
    location: form.location?.trim() || null,
    purchaseDate: form.purchaseDate || null,
    notes: form.notes?.trim() || null,
  }
}

const MOVEMENT_TYPE_TO_UI = {
  opening: 'apertura',
  outbound: 'salida',
  adjustment: 'ajuste',
  inbound: 'entrada',
}

export function mapInventoryMovementFromApi(movement) {
  return {
    id: movement.id,
    type: MOVEMENT_TYPE_TO_UI[movement.movementType] || movement.movementType,
    movementType: movement.movementType,
    items: (movement.items || []).map((item) => ({
      id: item.itemId,
      lineId: item.id,
      name: item.itemName,
      sku: item.itemSku,
      unit: item.unitSymbol,
      qty: Math.abs(Number(item.quantityDelta) || 0),
      delta: Number(item.quantityDelta) || 0,
      before: Number(item.quantityBefore) || 0,
      after: Number(item.quantityAfter) || 0,
      unitCost: item.unitCost == null ? null : Number(item.unitCost),
    })),
    employeeId: movement.employee?.id || null,
    employeeName: movement.employee?.name || null,
    employee: movement.employee?.name || null,
    appointmentId: movement.appointment?.id || null,
    appointmentLabel: movement.appointment?.label || null,
    comment: movement.comment || '',
    branchId: movement.branch.id,
    branchName: movement.branch.name,
    warehouseId: movement.warehouse.id,
    warehouseName: movement.warehouse.name,
    createdBy: movement.createdBy,
    createdAt: movement.createdAt,
    apiSynced: true,
  }
}

export function mapInventoryStockItemFromApi(item) {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    type: item.itemType,
    stock: item.stockQuantity == null ? null : Number(item.stockQuantity),
    minStock: item.minimumStock == null ? null : Number(item.minimumStock),
    unit: item.unitOfMeasure?.symbol || 'ud',
    branchId: item.stockLocations?.[0]?.branch?.id || item.branches?.[0]?.id,
  }
}

export function mapSupplyUsageFromApi(row) {
  return {
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    supplyId: row.supplyId,
    supplyName: row.supplyName,
    qty: Number(row.quantity) || 0,
    appointmentsCount: Number(row.appointmentsCount) || 0,
    perAppointment: row.perAppointment == null ? null : Number(row.perAppointment),
  }
}

export function outboundMovementToApiPayload(data) {
  if (!data.branchId || data.branchId === 'all') throw new Error('Selecciona una sucursal.')
  if (!data.employeeId) throw new Error('Selecciona el empleado responsable.')
  if (!data.items?.length) throw new Error('Selecciona al menos un insumo.')
  if (data.items.some((item) => !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0)) {
    throw new Error('Todas las cantidades de salida deben ser mayores que cero.')
  }
  return {
    branchId: data.branchId,
    employeeId: data.employeeId,
    appointmentId: data.appointmentId || null,
    comment: data.comment?.trim() || null,
    items: data.items.map((item) => ({
      itemId: item.id,
      quantity: Number(item.qty),
    })),
  }
}

export function adjustmentMovementToApiPayload(data) {
  if (!data.branchId || data.branchId === 'all') throw new Error('Selecciona una sucursal.')
  if (!data.items?.length) throw new Error('Selecciona al menos un producto o insumo.')
  const comment = data.comment?.trim()
  if (!comment || comment.length < 2) throw new Error('Indica el motivo del ajuste.')
  if (data.items.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0)) {
    throw new Error('La existencia física no puede ser negativa.')
  }
  return {
    branchId: data.branchId,
    comment,
    items: data.items.map((item) => ({
      itemId: item.id,
      quantity: Number(item.quantity),
    })),
  }
}
