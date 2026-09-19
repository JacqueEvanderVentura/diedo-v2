/** RFC4180-style CSV parser (quoted fields, commas and newlines inside quotes). */

function pushRecord(rows, headers, cells) {
  if (!headers?.length) return
  const hasValue = cells.some((value, index) => (index === 0 ? value.trim() !== '' : value !== ''))
  if (!hasValue) return
  const row = {}
  headers.forEach((header, index) => {
    row[header] = (cells[index] ?? '').trim()
  })
  rows.push(row)
}

export function parseCsv(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return []

  const rows = []
  let headers = null
  let cells = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (inQuotes) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      cells.push(cell)
      cell = ''
      continue
    }
    if (char === '\n') {
      cells.push(cell)
      cell = ''
      if (headers === null) {
        headers = cells.map((header) => header.trim())
      } else {
        pushRecord(rows, headers, cells)
      }
      cells = []
      continue
    }
    cell += char
  }

  if (cell !== '' || cells.length > 0) {
    cells.push(cell)
    if (headers === null) {
      headers = cells.map((header) => header.trim())
    } else {
      pushRecord(rows, headers, cells)
    }
  }

  return rows
}

const IMPORT_FIELD_LABELS = {
  displayName: 'Nombre para mostrar',
  firstName: 'Nombre',
  lastName: 'Apellido',
  businessName: 'Nombre comercial',
  email: 'Correo',
  phone: 'Teléfono',
  customerType: 'Tipo de cliente',
  externalId: 'ID externo',
}

export function formatImportApiError(error) {
  const base = error?.message || 'Error al enviar el lote al servidor.'
  const parameter = error?.parameter || ''
  const fieldMatch = parameter.match(/items\[\d+]\.(\w+)/) || parameter.match(/items\.\d+\.(\w+)/)
  const field = fieldMatch?.[1]
  const label = field ? (IMPORT_FIELD_LABELS[field] || field) : null
  if (label && !base.includes(label)) {
    return `${label}: ${base}`
  }
  return base
}

export function deriveCustomerDisplayName(mapped, row = {}) {
  const display = (mapped.displayName ?? row.displayName ?? '').trim()
  if (display.length >= 2) return display
  const business = (mapped.businessName ?? row.businessName ?? '').trim()
  if (business.length >= 2) return business
  const person = [
    (mapped.firstName ?? row.firstName ?? '').trim(),
    (mapped.lastName ?? row.lastName ?? '').trim(),
  ].filter(Boolean).join(' ')
  if (person.length >= 2) return person
  const phone = (mapped.phone ?? row.phone ?? '').trim()
  if (phone.length >= 2) return phone
  const externalId = (mapped.externalId ?? row.externalId ?? '').trim()
  if (externalId) return `Cliente ${externalId}`
  return 'Cliente sin nombre'
}

export function prepareCustomerRows(parsedRows) {
  const validRows = []
  const invalidRows = []
  parsedRows.forEach((row, index) => {
    const mapped = mapCsvRowToApi(row)
    mapped.displayName = deriveCustomerDisplayName(mapped, row)
    if (mapped.businessName && !mapped.firstName && !mapped.lastName) {
      mapped.customerType = mapped.customerType || 'business'
    }
    if (!mapped.displayName || mapped.displayName.length < 2) {
      invalidRows.push({
        externalId: mapped.externalId || null,
        status: 'error',
        message: 'Nombre para mostrar: falta nombre, empresa, teléfono o ID externo.',
        rowNumber: index + 2,
      })
      return
    }
    validRows.push(pickImportKeys(mapped, CUSTOMER_IMPORT_KEYS))
  })
  return { validRows, invalidRows }
}

export function prepareActivityRows(parsedRows) {
  return parsedRows.map((row) => pickImportKeys(mapCsvRowToApi(row), ACTIVITY_IMPORT_KEYS))
}

export function batchErrorResults(batch, chunkIndex, chunkSize, error) {
  const message = formatImportApiError(error)
  const parameter = error?.parameter || ''
  const indexMatch = parameter.match(/items\[(\d+)]/) || parameter.match(/items\.(\d+)/)
  const failedIndex = indexMatch ? Number(indexMatch[1]) : null
  return batch.map((row, rowIndex) => ({
    externalId: row.externalId ?? null,
    status: 'error',
    message: failedIndex === null || failedIndex === rowIndex
      ? message
      : `Lote rechazado por error en otra fila (${message})`,
    rowNumber: chunkIndex * chunkSize + rowIndex + 2,
  }))
}

export function validatePipelineRow(row, mapped) {
  const name = (mapped.name ?? row.name ?? '').trim()
  const company = (mapped.company ?? row.company ?? '').trim()
  if (!name && !company) {
    return 'Falta nombre o empresa del lead.'
  }
  const externalId = (mapped.externalId ?? row.externalId ?? '').trim()
  if (externalId && !/^\d+$/.test(externalId)) {
    return 'externalId inválido (se espera el ID numérico de Kommo).'
  }
  return null
}

export function chunkRows(rows, size = 100) {
  const chunks = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

function camelKey(key) {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

const CUSTOMER_IMPORT_KEYS = new Set([
  'externalId',
  'customerType',
  'displayName',
  'firstName',
  'lastName',
  'businessName',
  'email',
  'phone',
  'acquisitionSource',
])

const ACTIVITY_IMPORT_KEYS = new Set([
  'externalId',
  'leadExternalId',
  'title',
  'description',
  'dueAt',
])

const PIPELINE_IMPORT_KEYS = new Set([
  'externalId',
  'name',
  'company',
  'email',
  'phone',
  'website',
  'location',
  'acquisitionSource',
  'stage',
  'value',
  'notes',
  'lostReason',
  'convert',
])

function pickImportKeys(row, allowedKeys) {
  const picked = {}
  Object.entries(row).forEach(([key, value]) => {
    if (allowedKeys.has(key)) picked[key] = value
  })
  return picked
}

export function toPipelineImportItem(mapped) {
  return pickImportKeys(mapped, PIPELINE_IMPORT_KEYS)
}

export function mapCsvRowToApi(row) {
  const mapped = {}
  Object.entries(row).forEach(([key, value]) => {
    if (!key) return
    const camel = key.includes('_') || key.includes('-')
      ? key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      : key.charAt(0).toLowerCase() + key.slice(1)
    const apiKey = key.includes('_') ? camelKey(key) : camel
    if (value === '') {
      // API string fields with default "" reject JSON null (Pydantic string_type).
      if (apiKey === 'name' || apiKey === 'company') {
        mapped[apiKey] = ''
      }
      return
    }
    if (apiKey === 'email' && value && !value.includes('@')) {
      return
    }
    if (apiKey === 'convert') {
      mapped.convert = value === 'true'
      return
    }
    if (apiKey === 'value') {
      mapped.value = Number(value) || 0
      return
    }
    mapped[apiKey] = value
  })
  return mapped
}
