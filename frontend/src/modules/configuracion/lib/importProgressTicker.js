export const TICKER_VISIBLE_COUNT = 3
export const TICKER_MAX_ROWS = 30
export const TICKER_STEP_MS = 900

/** Solo las primeras N citas importadas entran al carrusel (máx. 30). */
export function computeTickerLimit(totalRows) {
  if (!totalRows || totalRows < 1) return 0
  return Math.min(TICKER_MAX_ROWS, totalRows)
}

export function toTickerRow(row) {
  const appointmentId = row.appointmentId ?? row.appointment_id ?? null
  const externalId = row.externalId ?? row.external_id ?? null
  const id = appointmentId
    || externalId
    || [row.displayName, row.date, row.time, row.phone].filter(Boolean).join('|')

  return {
    id: String(id),
    displayName: row.displayName ?? null,
    phone: row.phone ?? null,
    date: row.date ?? null,
    time: row.time ?? null,
    serviceName: row.serviceName ?? null,
  }
}

/** Filas creadas u omitidas del lote, en orden, para el ticker. */
export function sequentialTickerRowsFromBatch(batchResults) {
  return batchResults
    .filter((row) => row.status === 'created' || row.status === 'skipped')
    .map(toTickerRow)
}

export function appendTickerRowsCapped(existing, incoming, cap) {
  if (!incoming?.length || cap <= 0) return existing
  const remaining = cap - existing.length
  if (remaining <= 0) return existing
  return [...existing, ...incoming.slice(0, remaining)]
}

export function getTickerWindow(rows, startIndex, visibleCount = TICKER_VISIBLE_COUNT) {
  if (!rows?.length) return []
  if (rows.length <= visibleCount) return rows
  const maxStart = rows.length - visibleCount
  const safeStart = Math.max(0, Math.min(startIndex, maxStart))
  return rows.slice(safeStart, safeStart + visibleCount)
}

/** Avanza una fila; al llegar al final del pool vuelve al inicio (bucle). */
export function nextTickerStartIndex(rows, startIndex, visibleCount = TICKER_VISIBLE_COUNT) {
  if (!rows?.length || rows.length <= visibleCount) return 0
  const maxStart = rows.length - visibleCount
  if (startIndex >= maxStart) return 0
  return startIndex + 1
}
