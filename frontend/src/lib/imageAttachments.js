const objectUrls = new Set()

export function demoSvgImage(color, label = '') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><rect fill="${color}" width="160" height="120"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="14">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function createPreviewObjectUrl(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const objectUrl = URL.createObjectURL(file)
  objectUrls.add(objectUrl)
  return objectUrl
}

export function revokeObjectUrl(url) {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  if (!objectUrls.has(url)) return
  URL.revokeObjectURL(url)
  objectUrls.delete(url)
}

export function revokeAllObjectUrls() {
  objectUrls.forEach((url) => {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url)
    }
  })
  objectUrls.clear()
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

export async function filesToAttachments(files) {
  const items = await Promise.all(
    Array.from(files || []).map(async (file, index) => {
      const dataUrl = await fileToDataUrl(file)
      return {
        id: `local-${Date.now()}-${index}`,
        name: file.name || `Adjunto ${index + 1}`,
        contentType: file.type || 'image/jpeg',
        previewObjectUrl: dataUrl,
        dataUrl,
        pendingFile: file,
      }
    })
  )
  return items
}
