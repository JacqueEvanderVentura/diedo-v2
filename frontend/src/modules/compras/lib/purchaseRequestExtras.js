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
  const quoteFile = hydrateQuoteFile(extras.quoteFile) || request.quoteFile
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

export async function loadPurchaseQuoteBlob(quoteFile) {
  if (!quoteFile?.dataUrl) throw new Error('Cotización no disponible para vista previa.')
  const response = await fetch(quoteFile.dataUrl)
  return response.blob()
}
