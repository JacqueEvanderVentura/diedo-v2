import { DIEDO_MODULES, MODULE_LABELS } from '@/data/crm'

const VERTICALS = [
  {
    id: 'salon',
    patterns: [/sal[oó]n/i, /peluquer/i, /barber/i, /beauty/i, /belleza/i, /nail/i, /uñas/i],
    fits: { pos: 75, agenda: 95, inventarios: 70, finanzas: 60, crm: 80, incidencias: 50, config: 55 },
  },
  {
    id: 'spa',
    patterns: [/spa\b/i, /masaje/i, /wellness/i, /est[eé]tica/i, /facial/i],
    fits: { pos: 70, agenda: 98, inventarios: 65, finanzas: 55, crm: 85, incidencias: 45, config: 50 },
  },
  {
    id: 'clinica',
    patterns: [/cl[ií]nica/i, /consultorio/i, /m[eé]dico/i, /dental/i, /odontolog/i, /hospital/i],
    fits: { pos: 65, agenda: 92, inventarios: 75, finanzas: 70, crm: 88, incidencias: 60, config: 65 },
  },
  {
    id: 'restaurante',
    patterns: [/restaurant/i, /caf[eé]/i, /comida/i, /food/i, /bar\b/i, /bistro/i],
    fits: { pos: 95, agenda: 40, inventarios: 90, finanzas: 75, crm: 55, incidencias: 55, config: 60 },
  },
  {
    id: 'retail',
    patterns: [/tienda/i, /retail/i, /boutique/i, /ferreter/i, /minimarket/i, /supermercado/i],
    fits: { pos: 92, agenda: 25, inventarios: 95, finanzas: 70, crm: 60, incidencias: 45, config: 55 },
  },
  {
    id: 'carwash',
    patterns: [/car\s*wash/i, /lavado/i, /autolavado/i, /detailing/i],
    fits: { pos: 88, agenda: 70, inventarios: 80, finanzas: 65, crm: 72, incidencias: 55, config: 50 },
  },
  {
    id: 'gym',
    patterns: [/gym/i, /gimnasio/i, /fitness/i, /crossfit/i, /yoga/i],
    fits: { pos: 80, agenda: 85, inventarios: 55, finanzas: 65, crm: 90, incidencias: 50, config: 55 },
  },
]

const SIGNAL_PATTERNS = [
  { key: 'pos', patterns: [/caja/i, /punto de venta/i, /pos\b/i, /factur/i, /cobro/i, /venta/i] },
  { key: 'agenda', patterns: [/cita/i, /agenda/i, /reserv/i, /turno/i, /appointment/i, /booking/i] },
  { key: 'inventarios', patterns: [/inventario/i, /stock/i, /almac[eé]n/i, /producto/i, /insumo/i] },
  { key: 'finanzas', patterns: [/finanz/i, /contab/i, /presupuesto/i, /gasto/i, /ingreso/i] },
  { key: 'crm', patterns: [/cliente/i, /lead/i, /crm/i, /fideliz/i, /membres/i] },
  { key: 'incidencias', patterns: [/incidencia/i, /soporte/i, /mantenimiento/i, /ticket/i] },
  { key: 'config', patterns: [/sucursal/i, /multi-?sucursal/i, /franquicia/i, /permiso/i] },
]

function emptyFits() {
  return Object.fromEntries(DIEDO_MODULES.map((m) => [m, 0]))
}

function detectVertical(text) {
  const hay = `${text}`.toLowerCase()
  for (const v of VERTICALS) {
    if (v.patterns.some((p) => p.test(hay))) return v
  }
  return null
}

function signalBoost(text) {
  const boosts = emptyFits()
  const hay = `${text}`.toLowerCase()
  for (const sig of SIGNAL_PATTERNS) {
    if (sig.patterns.some((p) => p.test(hay))) boosts[sig.key] += 12
  }
  if (/google\.com\/maps|goo\.gl\/maps/i.test(hay)) boosts.crm += 5
  if (/review|rating|estrellas/i.test(hay)) boosts.crm += 8
  if (/website|sitio web|www\./i.test(hay)) boosts.crm += 6
  return boosts
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export const TOP_MODULES_FOR_SCORE = 5
export const TOP_MODULES_DISPLAY = 4

/** Promedio de los mejores N módulos; el ranking usa fit × peso de criterios. */
function scoreFromTopModules(moduleFits, weights, topN = TOP_MODULES_FOR_SCORE) {
  const ranked = DIEDO_MODULES.map((mod) => ({
    mod,
    fit: moduleFits[mod] ?? 0,
    rank: (moduleFits[mod] ?? 0) * (weights[mod] ?? 1),
  })).sort((a, b) => b.rank - a.rank)

  const top = ranked.slice(0, topN)
  if (!top.length) return 0
  const avg = top.reduce((sum, t) => sum + t.fit, 0) / top.length
  return clamp(avg)
}

export function effectiveScore(lead) {
  if (lead.scoreManual != null && lead.scoreManual !== '') return Number(lead.scoreManual)
  return lead.scoreAuto ?? 0
}

export function computeAutoScore(lead, weights = {}) {
  const text = [lead.name, lead.company, lead.rawSnippet, lead.location, lead.website].filter(Boolean).join(' ')
  const vertical = detectVertical(text)
  const base = vertical ? { ...vertical.fits } : { pos: 45, agenda: 45, inventarios: 45, finanzas: 40, crm: 50, incidencias: 35, config: 35 }
  const boosts = signalBoost(text)

  const moduleFits = {}
  const reasons = []

  if (vertical) reasons.push(`Vertical detectada: ${vertical.id}`)

  for (const mod of DIEDO_MODULES) {
    const raw = clamp((base[mod] || 30) + (boosts[mod] || 0))
    moduleFits[mod] = raw
    if (boosts[mod] > 0) reasons.push(`Señal ${mod}: +${boosts[mod]}`)
  }

  const score = scoreFromTopModules(moduleFits, weights)
  const topMods = Object.entries(moduleFits)
    .sort((a, b) => b[1] * (weights[a[0]] ?? 1) - a[1] * (weights[b[0]] ?? 1))
    .slice(0, TOP_MODULES_FOR_SCORE)
    .map(([mod]) => MODULE_LABELS[mod] || mod)
  if (topMods.length) reasons.push(`Top módulos: ${topMods.join(', ')}`)
  if (lead.website) reasons.push('Tiene sitio web')
  if (lead.phone) reasons.push('Teléfono disponible')

  return { score, moduleFits, reasons }
}

export function topModuleFits(moduleFits, limit = TOP_MODULES_DISPLAY) {
  if (!moduleFits) return []
  return Object.entries(moduleFits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }))
}

export function scoreTone(score) {
  if (score >= 75) return 'success'
  if (score >= 50) return 'brand'
  if (score >= 30) return 'warning'
  return 'neutral'
}
