// Currency & number formatting — Dominican Peso (RD$)

export function formatDOP(value, { decimals = 2 } = {}) {
  const n = Number(value || 0)
  const formatted = n.toLocaleString('es-DO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `RD$ ${formatted}`
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-DO')
}

export function formatCompact(value) {
  const n = Number(value || 0)
  if (Math.abs(n) >= 1000) {
    return `$${(n / 1000).toLocaleString('es-DO', { maximumFractionDigits: 0 })}k`
  }
  return `$${n}`
}
