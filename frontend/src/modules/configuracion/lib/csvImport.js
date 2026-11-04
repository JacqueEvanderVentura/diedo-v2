/** RFC4180-style CSV parser (quoted fields, commas and newlines inside quotes). */

import { IMPORT_REQUIRED_HEADERS } from '@/modules/configuracion/lib/importExcelTemplates'

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

export const IMPORT_CSV_TEMPLATES = {
  pipeline: `externalId,name,company,email,phone,website,location,acquisitionSource,stage,value,notes,lostReason,isClient
sample-1,Juan Pérez,,juan@example.com,8095550001,,,whatsapp,contactado,0,,,false`,
  customers: `externalId,customerType,displayName,firstName,lastName,businessName,email,phone,acquisitionSource
sample-c-1,person,Juan Pérez,Juan,Pérez,,juan@example.com,8095550001,otros`,
  activities: `externalId,leadExternalId,contactName,title,description,dueAt
sample-a-1,sample-1,Juan Pérez,Llamada de seguimiento,Notas,2026-09-20T10:00:00.000Z`,
  agenda: `externalId,date,time,duration,customerName,customerPhone,customerEmail,documentType,documentId,serviceName,resourceName,specialistName,price,notes
sample-cita-1,2026-11-15,10:00,30,María Pérez,8095550101,maria@example.com,cedula,00112345678,Limpieza Facial,Cabina 1,Dra. Soto,2500,`,
}

export const IMPORT_TEMPLATE_FORMAT_ERROR =
  'El archivo no usa el formato de la plantilla. Descarga la plantilla con el botón Plantilla, justo arriba de Subir CSV, y vuelve a intentarlo.'

export function normalizeCsvHeaderKey(key) {
  const trimmed = (key ?? '').replace(/^\uFEFF/, '').trim()
  if (!trimmed) return ''
  if (/\s/.test(trimmed)) {
    return trimmed
      .split(/\s+/)
      .map((part, index) => {
        const lower = part.toLowerCase()
        if (index === 0) return lower
        return lower.charAt(0).toUpperCase() + lower.slice(1)
      })
      .join('')
  }
  if (trimmed.includes('_') || trimmed.includes('-')) {
    return trimmed
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  }
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

export function getImportTemplateColumns(kind) {
  if (IMPORT_REQUIRED_HEADERS[kind]) {
    return IMPORT_REQUIRED_HEADERS[kind]
  }
  const template = IMPORT_CSV_TEMPLATES[kind]
  if (!template) return []
  return template.split('\n')[0].split(',').map((column) => column.trim()).filter(Boolean)
}

export function validateImportTemplateHeaders(kind, headers) {
  const required = getImportTemplateColumns(kind)
  const present = new Set(headers.map((header) => normalizeCsvHeaderKey(header)).filter(Boolean))
  const missing = required.filter((column) => !present.has(column))
  if (missing.length > 0) {
    return { ok: false, missing }
  }
  return { ok: true, missing: [] }
}

export function parseCsvWithHeaders(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return { headers: [], rows: [] }

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

  return { headers: headers ?? [], rows }
}

export function parseCsv(text) {
  return parseCsvWithHeaders(text).rows
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

const AGENDA_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const AGENDA_TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

function parseAgendaDuration(raw) {
  if (raw === '' || raw === undefined || raw === null) return 30
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 5 || value > 480) return null
  return Math.trunc(value)
}

function parseAgendaPrice(raw) {
  if (raw === '' || raw === undefined || raw === null) return 0
  const value = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

export function prepareAgendaRows(parsedRows) {
  const validRows = []
  const invalidRows = []
  parsedRows.forEach((row, index) => {
    const mapped = pickImportKeys(mapCsvRowToApi(row), AGENDA_IMPORT_KEYS)
    const rowNumber = index + 2

    const date = (mapped.date ?? row.date ?? '').trim()
    if (!AGENDA_DATE_RE.test(date)) {
      invalidRows.push({
        externalId: mapped.externalId || null,
        status: 'error',
        message: 'Fecha: usa el formato AAAA-MM-DD.',
        rowNumber,
      })
      return
    }

    const time = (mapped.time ?? row.time ?? '').trim()
    if (!AGENDA_TIME_RE.test(time)) {
      invalidRows.push({
        externalId: mapped.externalId || null,
        status: 'error',
        message: 'Hora: usa el formato HH:MM (24 h).',
        rowNumber,
      })
      return
    }

    const customerName = (mapped.customerName ?? row.customerName ?? '').trim()
    const customerPhone = (mapped.customerPhone ?? row.customerPhone ?? '').trim()
    const customerEmail = (mapped.customerEmail ?? row.customerEmail ?? '').trim()
    const documentType = (mapped.documentType ?? row.documentType ?? mapped.customerDocumentType ?? row.customerDocumentType ?? '').trim()
    const documentId = (mapped.documentId ?? row.documentId ?? mapped.customerDocumentId ?? row.customerDocumentId ?? '').trim()
    const normalizedDocumentType = documentType.toLowerCase()
    if (documentType && !['cedula', 'pasaporte', 'otro'].includes(normalizedDocumentType)) {
      invalidRows.push({
        externalId: mapped.externalId || null,
        status: 'error',
        message: 'Document Type: usa cedula, pasaporte u otro.',
        rowNumber,
      })
      return
    }
    if ((documentType && !documentId) || (!documentType && documentId)) {
      invalidRows.push({
        externalId: mapped.externalId || null,
        status: 'error',
        message: 'Document Type y Document Id deben ir juntos o dejarse vacíos.',
        rowNumber,
      })
      return
    }
    if (!customerName && !customerPhone && !customerEmail) {
      invalidRows.push({
        externalId: mapped.externalId || null,
        status: 'error',
        message: 'Indica nombre, teléfono o correo del cliente.',
        rowNumber,
      })
      return
    }

    const resourceName = (mapped.resourceName ?? row.resourceName ?? '').trim()

    const duration = parseAgendaDuration(mapped.duration ?? row.duration)
    if (duration === null) {
      invalidRows.push({
        externalId: mapped.externalId || null,
        status: 'error',
        message: 'Duración: entre 5 y 480 minutos.',
        rowNumber,
      })
      return
    }

    const price = parseAgendaPrice(mapped.price ?? row.price)
    if (price === null) {
      invalidRows.push({
        externalId: mapped.externalId || null,
        status: 'error',
        message: 'Precio: debe ser un número mayor o igual a 0.',
        rowNumber,
      })
      return
    }

    validRows.push({
      externalId: mapped.externalId || undefined,
      date,
      time,
      duration,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
      ...(documentType && documentId ? { documentType: normalizedDocumentType, documentId } : {}),
      serviceName: (mapped.serviceName ?? row.serviceName ?? '').trim(),
      ...(resourceName ? { resourceName } : {}),
      specialistName: (mapped.specialistName ?? row.specialistName ?? '').trim() || undefined,
      price,
      notes: (mapped.notes ?? row.notes ?? '').trim() || undefined,
    })
  })
  return { validRows, invalidRows }
}

export function batchErrorResults(batch, chunkIndex, chunkSize, error) {
  const message = formatImportApiError(error)
  const parameter = error?.parameter || ''
  const indexMatch = parameter.match(/items\[(\d+)]/) || parameter.match(/items\.(\d+)/)
  const failedIndex = indexMatch ? Number(indexMatch[1]) : null
  return batch.map((row, rowIndex) => ({
    externalId: row.externalId ?? null,
    displayName: row.displayName ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
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
  'documentType',
  'documentId',
])

const ACTIVITY_IMPORT_KEYS = new Set([
  'externalId',
  'leadExternalId',
  'title',
  'description',
  'dueAt',
])

const AGENDA_IMPORT_KEYS = new Set([
  'externalId',
  'date',
  'time',
  'duration',
  'customerName',
  'customerPhone',
  'customerEmail',
  'documentType',
  'documentId',
  'customerDocumentType',
  'customerDocumentId',
  'serviceName',
  'resourceName',
  'specialistName',
  'price',
  'notes',
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
  'documentType',
  'documentId',
  'stage',
  'value',
  'notes',
  'lostReason',
  'isClient',
])

function pickImportKeys(row, allowedKeys) {
  const picked = {}
  Object.entries(row).forEach(([key, value]) => {
    if (allowedKeys.has(key)) picked[key] = value
  })
  return picked
}

export function toPipelineImportItem(mapped) {
  const picked = pickImportKeys(mapped, PIPELINE_IMPORT_KEYS)
  if (picked.stage) {
    picked.status = picked.stage
    delete picked.stage
  }
  if (picked.value !== undefined) {
    picked.pipelineValue = picked.value
    delete picked.value
  }
  const clientFlag = picked.isClient ?? mapped.convert
  if (clientFlag !== undefined) {
    picked.convert = clientFlag === true || String(clientFlag).toLowerCase() === 'true'
  }
  delete picked.isClient
  return picked
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
    if (apiKey === 'isClient') {
      mapped.isClient = value === true || String(value).toLowerCase() === 'true'
      return
    }
    if (apiKey === 'value') {
      mapped.value = Number(value) || 0
      return
    }
    if (apiKey === 'duration') {
      mapped.duration = value
      return
    }
    if (apiKey === 'price') {
      mapped.price = value
      return
    }
    mapped[apiKey] = value
  })
  return mapped
}
