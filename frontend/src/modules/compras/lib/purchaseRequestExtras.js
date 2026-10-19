import { canonicalizeMeasureUnit } from './measureUnits'

const STORAGE_KEY = 'diedo-purchase-request-extras'

function readArchive() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeArchive(archive) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive))
  } catch {
    // best effort
  }
}

export function serializeQuoteFile(quoteFile) {
  if (!quoteFile) return null
  const dataUrl = quoteFile.dataUrl || quoteFile.previewObjectUrl
  if (!dataUrl && !quoteFile.name) return null
  return {
    name: quoteFile.name || 'cotizacion.pdf',
    contentType: quoteFile.contentType || 'application/pdf',
    dataUrl: dataUrl || null,
  }
}

export function hydrateQuoteFile(serialized) {
  if (!serialized) return null
  if (!serialized.dataUrl) return { name: serialized.name }
  return {
    name: serialized.name,
    contentType: serialized.contentType,
    dataUrl: serialized.dataUrl,
    previewObjectUrl: serialized.dataUrl,
  }
}

export function savePurchaseRequestExtras(requestId, extras) {
  if (!requestId) return
  const archive = readArchive()
  archive[requestId] = {
    quoteFile: serializeQuoteFile(extras.quoteFile),
    items: (extras.items || []).map((item, index) => ({
      index,
      supplyProductId: item.supplyProductId || null,
      supplyCategoryId: item.supplyCategoryId || null,
    })),
  }
  writeArchive(archive)
}

export function loadPurchaseRequestExtras(requestId) {
  return readArchive()[requestId] || null
}

export function mergePurchaseRequestExtras(request) {
  if (!request?.id) return request
  const extras = loadPurchaseRequestExtras(request.id)
  if (!extras) return request
  const quoteFile = (request.quoteFile?.previewUrl || request.quoteFile?.id)
    ? request.quoteFile
    : hydrateQuoteFile(extras.quoteFile) || request.quoteFile
  const items = (request.items || []).map((item, index) => {
    const meta = extras.items?.find((row) => row.index === index) || extras.items?.[index]
    if (!meta) return item
    return {
      ...item,
      supplyProductId: meta.supplyProductId || item.supplyProductId || null,
      supplyCategoryId: meta.supplyCategoryId || item.supplyCategoryId || null,
    }
  })
  return { ...request, quoteFile, items }
}

function namesMatch(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
}

export function resolveRequestSupplyCategory(supply, categories = []) {
  if (!supply) return ''
  const candidates = [supply.categoryId, supply.category]
  for (const candidate of candidates) {
    if (!candidate) continue
    const byId = categories.find((row) => row.id === candidate)
    if (byId) return byId.id
  }
  const label = String(supply.categoryName || '').trim().toLowerCase()
  if (!label) return ''
  return categories.find((row) => row.name.trim().toLowerCase() === label)?.id || ''
}

export function applySupplierCatalogToRequestItem(item, catalogRow, supplies = [], categories = []) {
  if (!catalogRow) return { ...item, catalogItemId: '' }
  const categoryId = catalogRow.categoryId || ''
  const matchedSupply = supplies.find((supply) => namesMatch(supply.name, catalogRow.name))
  const linkedSupply = matchedSupply || null
  const fromSupply = resolveRequestSupplyCategory(linkedSupply, categories)
  const unit = canonicalizeMeasureUnit(catalogRow.unit) || canonicalizeMeasureUnit(linkedSupply?.unit) || item.unit || 'Unidad'
  return {
    ...item,
    catalogItemId: catalogRow.id,
    name: catalogRow.name || '',
    unit,
    price: Number(catalogRow.unitPrice) || 0,
    categoryId: categoryId || fromSupply || '',
    supplyCategoryId: categoryId || fromSupply || '',
    supplyProductId: linkedSupply?.id || '',
  }
}

export function applyInventorySupplyToRequestItem(item, supply, categories = []) {
  if (!supply) return { ...item, supplyProductId: '' }
  const supplyCategoryId = resolveRequestSupplyCategory(supply, categories)
    || item.supplyCategoryId
    || item.categoryId
    || ''
  const sameName = namesMatch(item.name, supply.name)
  const keepCatalog = Boolean(item.catalogItemId) && (sameName || !item.name)
  return {
    ...item,
    supplyProductId: supply.id,
    catalogItemId: keepCatalog ? item.catalogItemId : '',
    name: supply.name || item.name,
    unit: canonicalizeMeasureUnit(supply.unit) || item.unit || 'Unidad',
    supplyCategoryId,
    categoryId: supplyCategoryId,
  }
}

export async function loadPurchaseQuoteBlob(quoteFile) {
  if (!quoteFile) throw new Error('Cotización no disponible para vista previa.')
  if (quoteFile.previewUrl || quoteFile.downloadUrl) {
    const { loadDocumentAttachmentBlob } = await import('@/lib/documentAttachments')
    return loadDocumentAttachmentBlob(quoteFile)
  }
  if (!quoteFile.dataUrl) throw new Error('Cotización no disponible para vista previa.')
  const response = await fetch(quoteFile.dataUrl)
  return response.blob()
}
