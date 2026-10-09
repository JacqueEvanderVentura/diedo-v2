const CUSTOM_UNITS_KEY = 'diedo.supplierCatalog.customUnits'

export const COMMON_MEASURE_UNITS = [
  'Unidad',
  'Pieza',
  'Par',
  'Docena',
  'Caja',
  'Paquete',
  'Bolsa',
  'Rollo',
  'Lata',
  'Botella',
  'Bidón',
  'Saco',
  'Galón',
  'Litro',
  'ml',
  'Kilogramo',
  'Gramo',
  'Libra',
  'Onza',
  'Metro',
  'cm',
  'Juego',
]

function readStoredUnits() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_UNITS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((unit) => typeof unit === 'string' && unit.trim()) : []
  } catch {
    return []
  }
}

export function loadCustomMeasureUnits() {
  return readStoredUnits()
}

export function persistCustomMeasureUnit(unit) {
  const label = String(unit || '').trim()
  if (!label) return readStoredUnits()
  const current = readStoredUnits()
  const exists = current.some((row) => row.toLowerCase() === label.toLowerCase())
  const next = exists ? current : [...current, label]
  localStorage.setItem(CUSTOM_UNITS_KEY, JSON.stringify(next))
  return next
}

const UNIT_ALIASES = {
  ud: 'Unidad',
  u: 'Unidad',
  unit: 'Unidad',
  unidad: 'Unidad',
  pz: 'Pieza',
  pieza: 'Pieza',
  caja: 'Caja',
  box: 'Caja',
  paq: 'Paquete',
  paquete: 'Paquete',
  pack: 'Paquete',
  lt: 'Litro',
  l: 'Litro',
  litro: 'Litro',
  litros: 'Litro',
  ml: 'ml',
  kg: 'Kilogramo',
  kilogramo: 'Kilogramo',
  g: 'Gramo',
  gr: 'Gramo',
  gramo: 'Gramo',
  gal: 'Galón',
  galon: 'Galón',
  lb: 'Libra',
  libra: 'Libra',
  oz: 'Onza',
  m: 'Metro',
  metro: 'Metro',
  cm: 'cm',
}

function foldUnit(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function canonicalizeMeasureUnit(unit) {
  const raw = String(unit || '').trim()
  if (!raw) return ''
  const aliased = UNIT_ALIASES[foldUnit(raw)]
  if (aliased) return aliased
  return COMMON_MEASURE_UNITS.find((item) => foldUnit(item) === foldUnit(raw)) || raw
}

export function mergeMeasureUnits(...groups) {
  const seen = new Set()
  const merged = []
  groups.flat().forEach((unit) => {
    const label = String(unit || '').trim()
    if (!label) return
    const key = label.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    merged.push(label)
  })
  return merged
}
