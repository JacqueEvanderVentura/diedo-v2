import { formatDOP } from '@/lib/format'
import { formatLongDate, endTime } from './calendar'

const W = 380
const SCALE = 2
const PAD = 20

const COLORS = {
  white: '#ffffff',
  border: '#e2e8f0',
  headerFrom: '#2563eb',
  headerTo: '#4f46e5',
  indigo400: '#818cf8',
  amber300: '#fcd34d',
  amber950: '#451a03',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate900: '#0f172a',
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue100Text: '#dbeafe',
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines = []
  let line = words[0]
  for (let i = 1; i < words.length; i += 1) {
    const next = `${line} ${words[i]}`
    if (ctx.measureText(next).width <= maxWidth) line = next
    else {
      lines.push(line)
      line = words[i]
    }
  }
  lines.push(line)
  return lines
}

function computeLayout(model, ctx) {
  const headerH = 72
  const timeBoxH = 58
  const innerW = W - PAD * 2 - 28
  ctx.font = '600 14px Inter, system-ui, sans-serif'
  const serviceLines = wrapLines(ctx, model.serviceName || 'Servicio', innerW)
  const serviceBoxH = 28 + serviceLines.length * 20 + 44

  let h = headerH + PAD
  h += 32
  h += timeBoxH + 16
  h += serviceBoxH
  if (model.showAudit && (model.createdBy || model.updatedBy)) {
    h += 12 + 12
    if (model.createdBy) h += 16
    if (model.updatedBy) h += 16
  }
  h += PAD

  return { H: h, serviceLines, serviceBoxH, timeBoxH, headerH }
}

export function buildShareCardModel(appointment, { staffName, statusLabel, proximo, showAudit = false }) {
  return {
    customerName: appointment?.customerName || 'Cliente',
    customerPhone: appointment?.customerPhone || '',
    dateLabel: formatLongDate(appointment?.date),
    timeStart: appointment?.time || '',
    timeEnd: endTime(appointment?.time, appointment?.duration),
    duration: appointment?.duration,
    serviceName: appointment?.serviceName || 'Servicio',
    staffName: staffName && staffName !== '—' ? staffName : 'Especialista por asignar',
    priceLabel: formatDOP(appointment?.price || 0),
    statusLabel: proximo ? 'Próximo' : statusLabel,
    proximo: !!proximo,
    createdBy: showAudit ? appointment?.createdBy : undefined,
    updatedBy: showAudit ? appointment?.updatedBy : undefined,
    showAudit,
  }
}

export function renderShareCardCanvas(model) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el lienzo')

  const { H, serviceLines, serviceBoxH, timeBoxH, headerH } = computeLayout(model, ctx)
  canvas.width = W * SCALE
  canvas.height = H * SCALE

  ctx.scale(SCALE, SCALE)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 16)
  ctx.fillStyle = COLORS.white
  ctx.fill()
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  ctx.stroke()

  const grad = ctx.createLinearGradient(0, 0, W, headerH)
  grad.addColorStop(0, COLORS.headerFrom)
  grad.addColorStop(1, COLORS.headerTo)
  ctx.save()
  roundRect(ctx, 1, 1, W - 2, headerH, 15)
  ctx.clip()
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, headerH)
  ctx.restore()

  const initials = (model.customerName || 'C').slice(0, 1).toUpperCase()
  ctx.fillStyle = COLORS.indigo400
  ctx.beginPath()
  ctx.arc(40, 36, 24, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = COLORS.white
  ctx.font = '700 18px Outfit, Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, 40, 36)

  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.white
  ctx.font = '700 16px Outfit, Inter, system-ui, sans-serif'
  const nameMax = W - 170
  let displayName = model.customerName
  while (ctx.measureText(displayName).width > nameMax && displayName.length > 1) {
    displayName = `${displayName.slice(0, -1)}…`
  }
  ctx.fillText(displayName, 76, model.customerPhone ? 28 : 36)

  if (model.customerPhone) {
    ctx.fillStyle = COLORS.blue100Text
    ctx.font = '500 12px Inter, system-ui, sans-serif'
    ctx.fillText(model.customerPhone, 76, 46)
  }

  const badge = String(model.statusLabel || '').toUpperCase()
  ctx.font = '700 10px Inter, system-ui, sans-serif'
  const badgeW = ctx.measureText(badge).width + 20
  const badgeX = W - PAD - badgeW
  const badgeY = 26
  roundRect(ctx, badgeX, badgeY, badgeW, 22, 11)
  ctx.fillStyle = model.proximo ? COLORS.amber300 : COLORS.indigo400
  ctx.fill()
  ctx.fillStyle = model.proximo ? COLORS.amber950 : COLORS.white
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(badge, badgeX + badgeW / 2, badgeY + 11)

  let y = headerH + PAD
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  ctx.fillStyle = COLORS.blue500
  ctx.font = '700 13px Inter, system-ui, sans-serif'
  ctx.fillText('📅', PAD, y + 1)
  ctx.fillStyle = COLORS.slate600
  ctx.font = '500 14px Inter, system-ui, sans-serif'
  const dateText = model.dateLabel.charAt(0).toUpperCase() + model.dateLabel.slice(1)
  ctx.fillText(dateText, PAD + 22, y)

  y += 32
  roundRect(ctx, PAD, y, W - PAD * 2, timeBoxH, 12)
  ctx.fillStyle = COLORS.blue50
  ctx.fill()
  ctx.strokeStyle = COLORS.blue100
  ctx.stroke()

  ctx.fillStyle = COLORS.blue600
  ctx.font = '700 13px Inter, system-ui, sans-serif'
  ctx.fillText('🕐', PAD + 14, y + 18)

  ctx.fillStyle = COLORS.slate900
  ctx.font = '700 18px Outfit, Inter, system-ui, sans-serif'
  ctx.fillText(`${model.timeStart} – ${model.timeEnd}`, PAD + 40, y + 12)

  if (model.duration) {
    ctx.fillStyle = COLORS.slate500
    ctx.font = '500 12px Inter, system-ui, sans-serif'
    ctx.fillText(`${model.duration} min`, PAD + 40, y + 34)
  }

  y += timeBoxH + 16
  const boxX = PAD
  const boxW = W - PAD * 2

  roundRect(ctx, boxX, y, boxW, serviceBoxH, 12)
  ctx.fillStyle = COLORS.slate50
  ctx.fill()

  let sy = y + 14
  ctx.fillStyle = COLORS.slate900
  ctx.font = '600 14px Inter, system-ui, sans-serif'
  serviceLines.forEach((line) => {
    ctx.fillText(line, boxX + 14, sy)
    sy += 20
  })

  sy += 6
  ctx.fillStyle = COLORS.slate500
  ctx.font = '500 12px Inter, system-ui, sans-serif'
  ctx.fillText(`👤 ${model.staffName}`, boxX + 14, sy)

  ctx.fillStyle = COLORS.blue600
  ctx.font = '700 14px Outfit, Inter, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(model.priceLabel, boxX + boxW - 14, sy)
  ctx.textAlign = 'left'

  y += serviceBoxH

  if (model.showAudit && (model.createdBy || model.updatedBy)) {
    y += 12
    ctx.strokeStyle = COLORS.slate100
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
    y += 12

    ctx.fillStyle = COLORS.slate400
    ctx.font = '500 11px Inter, system-ui, sans-serif'
    if (model.createdBy) {
      ctx.fillText('Creado por ', PAD, y)
      const w1 = ctx.measureText('Creado por ').width
      ctx.fillStyle = COLORS.slate600
      ctx.fillText(model.createdBy, PAD + w1, y)
      y += 16
    }
    if (model.updatedBy) {
      ctx.fillStyle = COLORS.slate400
      ctx.fillText('Editado por ', PAD, y)
      const w2 = ctx.measureText('Editado por ').width
      ctx.fillStyle = COLORS.slate600
      ctx.fillText(model.updatedBy, PAD + w2, y)
      y += 16
    }
  }

  return canvas
}
