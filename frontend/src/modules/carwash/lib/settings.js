import { formatDOP } from '@/lib/format'

// Client validation is feedback only; the API validates and stores Decimal values.
function hundredths(value, maximum = 100) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return null
  const [whole, fraction = ''] = String(value).split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(result) && result <= maximum * 100 ? result : null
}

export function validateRates(line) {
  const washer = hundredths(line.washerRate)
  const supervisor = hundredths(line.supervisorRate)
  if (washer === null || supervisor === null) return 'Cada comisión debe estar entre 0 y 100, con hasta dos decimales.'
  if (washer + supervisor > 10000) return 'La suma de las comisiones no puede superar el 100 %.'
  return null
}

export function buildServiceBatch(branchId, lines, mode) {
  if (!branchId || !lines.length || lines.length > 20) throw new Error('Selecciona entre 1 y 20 servicios para esta sucursal.')
  return { branchId, services: lines.map((line) => {
    const error = validateRates(line)
    if (error) throw new Error(error)
    const rates = { washerRate: String(line.washerRate), supervisorRate: String(line.supervisorRate) }
    if (mode === 'existing') return { ...rates, itemId: line.itemId }
    if (line.name.trim().length < 2 || !line.categoryId || !line.unitOfMeasureId) throw new Error('Completa nombre, categoría y unidad de cada servicio.')
    if (hundredths(line.salePrice, 999999999999.99) === null || hundredths(line.taxRate) === null) throw new Error('Revisa el precio y los impuestos: usa importes positivos o cero, con hasta dos decimales.')
    return { ...rates, newService: { name: line.name.trim(), categoryId: line.categoryId, unitOfMeasureId: line.unitOfMeasureId, salePrice: String(line.salePrice), taxRate: String(line.taxRate) } }
  }) }
}

export function currencyFormatter(workspace) {
  const currency = workspace?.defaultCurrency || 'DOP'
  return (value) => value == null ? 'Sin precio' : currency === 'DOP' ? formatDOP(value) : new Intl.NumberFormat(workspace?.locale || 'es', { style: 'currency', currency }).format(Number(value))
}
