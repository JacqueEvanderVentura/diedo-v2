import { buildShareCardModel, renderShareCardCanvas } from './shareCardCanvas'

export { buildShareCardModel } from './shareCardCanvas'

export async function copyAppointmentShareImage(model) {
  const canvas = renderShareCardCanvas(model)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('No se pudo generar la imagen')
  if (!navigator.clipboard?.write) throw new Error('El portapapeles no está disponible')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export async function downloadAppointmentShareImage(model, filename) {
  const canvas = renderShareCardCanvas(model)
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function shareCardFilename(appointment) {
  const slug = (appointment?.customerName || 'cita').replace(/\s+/g, '-').slice(0, 24)
  return `cita-${slug}-${appointment?.date || 'fecha'}.png`
}

/** @deprecated Use copyAppointmentShareImage with buildShareCardModel */
export async function copyElementAsImage() {
  throw new Error('Usa copyAppointmentShareImage')
}

/** @deprecated Use downloadAppointmentShareImage with buildShareCardModel */
export async function downloadElementAsPng() {
  throw new Error('Usa downloadAppointmentShareImage')
}
