import ExcelJS from 'exceljs'

import { ACQUISITION_SOURCES, LEAD_STATUSES } from '@/data/crm'

/** Valores aceptados en importación de clientes (backend CustomerType). */
export const IMPORT_CUSTOMER_TYPE_OPTIONS = ['person', 'business']

export const IMPORT_TEMPLATE_MODAL_INTRO =
  'Las columnas en negrita son obligatorias; las regulares son opcionales.'

const MODAL_FOOTER_LINES = [
  'Guarda como CSV UTF-8 para subir el archivo.',
  'Lotes de hasta 100 filas.',
]

function buildInstructionsText(bodyLines) {
  return [IMPORT_TEMPLATE_MODAL_INTRO, ...bodyLines, ...MODAL_FOOTER_LINES].join('\n\n')
}

const VALIDATION_LAST_ROW = 5000

/** @typedef {{ key: string, label: string, required: boolean, sample?: string | number | boolean }} ImportTemplateColumn */

/** @type {Record<string, { sheetName: string, fileSlug: string, bodyLines: string[], instructions?: string, columns: ImportTemplateColumn[], documentTypeColumnKey?: string | null }>} */
export const IMPORT_EXCEL_TEMPLATE_CONFIG = {
  pipeline: {
    sheetName: 'Leads',
    fileSlug: 'pipeline',
    bodyLines: [
      'Indica al menos uno entre name o company.',
      'externalId numérico si viene de Kommo. documentType y documentId son opcionales (van juntos).',
      'stage: etapa del embudo (lista desplegable). Si es perdido, lostReason es obligatorio.',
      'isClient: true convierte el lead a cliente del directorio al importar; false o vacío solo crea el lead.',
      'acquisitionSource es opcional; usa la lista desplegable.',
    ],
    documentTypeColumnKey: 'documentType',
    listValidations: [
      {
        columnKey: 'acquisitionSource',
        values: [...ACQUISITION_SOURCES],
        errorTitle: 'Fuente de adquisición',
        error: 'Elige un valor de la lista.',
      },
      {
        columnKey: 'stage',
        values: [...LEAD_STATUSES],
        errorTitle: 'Etapa del embudo',
        error: 'Elige nuevo, contactado, propuesta, negociacion, cerrado o perdido.',
      },
      {
        columnKey: 'isClient',
        values: ['true', 'false'],
        errorTitle: 'Es cliente',
        error: 'Elige true o false.',
      },
    ],
    columns: [
      { key: 'externalId', label: 'externalId', required: false, sample: 'sample-1' },
      { key: 'name', label: 'name', required: true, sample: 'Juan Pérez' },
      { key: 'company', label: 'company', required: true, sample: '' },
      { key: 'email', label: 'email', required: false, sample: 'juan@example.com' },
      { key: 'phone', label: 'phone', required: false, sample: '8095550001' },
      { key: 'website', label: 'website', required: false, sample: '' },
      { key: 'location', label: 'location', required: false, sample: '' },
      { key: 'acquisitionSource', label: 'acquisitionSource', required: false, sample: 'whatsapp' },
      { key: 'documentType', label: 'Document Type', required: false, sample: 'cedula' },
      { key: 'documentId', label: 'Document Id', required: false, sample: '00112345678' },
      { key: 'stage', label: 'stage', required: false, sample: 'contactado' },
      { key: 'value', label: 'value', required: false, sample: 0 },
      { key: 'notes', label: 'notes', required: false, sample: '' },
      { key: 'lostReason', label: 'lostReason', required: false, sample: '' },
      { key: 'isClient', label: 'isClient', required: false, sample: false },
    ],
  },
  agenda: {
    sheetName: 'Agenda',
    fileSlug: 'agenda',
    bodyLines: [
      'Indica al menos uno entre customerName, customerPhone o customerEmail.',
      'documentType y documentId son opcionales; si no hay documento, al elegir "También agregar y fusionar clientes" se comparará por teléfono y correo.',
      'Al importar puedes fusionar clientes por documentType, teléfono o correo.',
    ],
    documentTypeColumnKey: 'documentType',
    columns: [
      { key: 'externalId', label: 'externalId', required: false, sample: 'sample-cita-1' },
      { key: 'date', label: 'date', required: true, sample: '2026-11-15' },
      { key: 'time', label: 'time', required: true, sample: '10:00' },
      { key: 'duration', label: 'duration', required: false, sample: 30 },
      { key: 'customerName', label: 'customerName', required: false, sample: 'María Pérez' },
      { key: 'customerPhone', label: 'customerPhone', required: false, sample: '8095550101' },
      { key: 'customerEmail', label: 'customerEmail', required: false, sample: 'maria@example.com' },
      { key: 'documentType', label: 'Document Type', required: false, sample: 'cedula' },
      { key: 'documentId', label: 'Document Id', required: false, sample: '00112345678' },
      { key: 'serviceName', label: 'serviceName', required: false, sample: 'Limpieza Facial' },
      { key: 'resourceName', label: 'resourceName', required: false, sample: 'Cabina 1' },
      { key: 'specialistName', label: 'specialistName', required: false, sample: 'Dra. Soto' },
      { key: 'price', label: 'price', required: false, sample: 2500 },
      { key: 'notes', label: 'notes', required: false, sample: '' },
    ],
  },
  customers: {
    sheetName: 'Clientes',
    fileSlug: 'customers',
    bodyLines: [
      'Indica displayName o combina firstName, lastName, businessName, phone o externalId.',
      'customerType: person (persona física) o business (empresa). Opcional; por defecto person.',
      'documentType y documentId son opcionales (van juntos).',
      'acquisitionSource es opcional; usa la lista desplegable de la plantilla.',
      'Directorio compartido (POS / Clientes).',
    ],
    documentTypeColumnKey: 'documentType',
    listValidations: [
      {
        columnKey: 'customerType',
        values: IMPORT_CUSTOMER_TYPE_OPTIONS,
        errorTitle: 'Tipo de cliente',
        error: 'Elige person o business.',
      },
      {
        columnKey: 'acquisitionSource',
        values: [...ACQUISITION_SOURCES],
        errorTitle: 'Fuente de adquisición',
        error: 'Elige un valor de la lista (whatsapp, instagram, referral, otros, pos_walk_in, app, ai).',
      },
    ],
    columns: [
      { key: 'externalId', label: 'externalId', required: false, sample: 'sample-c-1' },
      { key: 'customerType', label: 'customerType', required: false, sample: 'person' },
      { key: 'displayName', label: 'displayName', required: true, sample: 'Juan Pérez' },
      { key: 'firstName', label: 'firstName', required: false, sample: 'Juan' },
      { key: 'lastName', label: 'lastName', required: false, sample: 'Pérez' },
      { key: 'businessName', label: 'businessName', required: false, sample: '' },
      { key: 'email', label: 'email', required: false, sample: 'juan@example.com' },
      { key: 'phone', label: 'phone', required: false, sample: '8095550001' },
      { key: 'documentType', label: 'Document Type', required: false, sample: 'cedula' },
      { key: 'documentId', label: 'Document Id', required: false, sample: '00112345678' },
      { key: 'acquisitionSource', label: 'acquisitionSource', required: false, sample: 'otros' },
    ],
  },
  activities: {
    sheetName: 'Actividades',
    fileSlug: 'activities',
    bodyLines: [
      'title es obligatorio. leadExternalId vincula la tarea al lead importado.',
      'dueAt en formato ISO (ej. 2026-09-20T10:00:00.000Z).',
    ],
    documentTypeColumnKey: null,
    columns: [
      { key: 'externalId', label: 'externalId', required: false, sample: 'sample-a-1' },
      { key: 'leadExternalId', label: 'leadExternalId', required: true, sample: 'sample-1' },
      { key: 'contactName', label: 'contactName', required: false, sample: 'Juan Pérez' },
      { key: 'title', label: 'title', required: true, sample: 'Llamada de seguimiento' },
      { key: 'description', label: 'description', required: false, sample: 'Notas' },
      { key: 'dueAt', label: 'dueAt', required: false, sample: '2026-09-20T10:00:00.000Z' },
    ],
  },
}

/** Headers mínimos que debe tener el CSV subido (sin columnas opcionales de documento). */
export const IMPORT_REQUIRED_HEADERS = {
  pipeline: [
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
    'isClient',
  ],
  agenda: [
    'externalId',
    'date',
    'time',
    'duration',
    'customerName',
    'customerPhone',
    'customerEmail',
    'serviceName',
    'resourceName',
    'specialistName',
    'price',
    'notes',
  ],
  customers: [
    'externalId',
    'customerType',
    'displayName',
    'firstName',
    'lastName',
    'businessName',
    'email',
    'phone',
    'acquisitionSource',
  ],
  activities: [
    'externalId',
    'leadExternalId',
    'contactName',
    'title',
    'description',
    'dueAt',
  ],
}

Object.values(IMPORT_EXCEL_TEMPLATE_CONFIG).forEach((config) => {
  config.instructions = buildInstructionsText(config.bodyLines)
})

export function getImportTemplateInstructions(kind) {
  return IMPORT_EXCEL_TEMPLATE_CONFIG[kind]?.instructions ?? IMPORT_TEMPLATE_MODAL_INTRO
}

/** Párrafos del modal (sin la intro en negrita). */
export function getImportTemplateModalParagraphs(kind) {
  const config = IMPORT_EXCEL_TEMPLATE_CONFIG[kind]
  if (!config) return []
  return [...config.bodyLines, ...MODAL_FOOTER_LINES]
}

export const IMPORT_KIND_SUMMARY = {
  pipeline: 'Importa leads y oportunidades al embudo.',
  agenda: 'Importa citas al calendario. Al subir el CSV podrás fusionar clientes.',
  customers: 'Importa o actualiza clientes del directorio (POS / CRM).',
  activities: 'Importa tareas vinculadas por leadExternalId.',
}

export function getImportKindTitle(kind) {
  if (kind === 'pipeline') return 'Embudo (leads)'
  if (kind === 'agenda') return 'Agenda (citas)'
  if (kind === 'customers') return 'Clientes'
  if (kind === 'activities') return 'Actividades'
  return kind
}

function columnLetter(index) {
  let n = index
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/** @param {import('exceljs').Worksheet} sheet */
function applyColumnListValidations(sheet, columns, validations) {
  validations.forEach(({ columnKey, values, errorTitle, error, allowBlank = true }) => {
    const columnIndex = columns.findIndex((c) => c.key === columnKey) + 1
    if (columnIndex <= 0 || !values?.length) return
    const col = columnLetter(columnIndex)
    sheet.dataValidations.add(`${col}2:${col}${VALIDATION_LAST_ROW}`, {
      type: 'list',
      allowBlank,
      formulae: [`"${values.join(',')}"`],
      showErrorMessage: true,
      errorTitle,
      error,
    })
  })
}

export async function downloadImportExcelTemplate(kind) {
  const config = IMPORT_EXCEL_TEMPLATE_CONFIG[kind]
  if (!config) {
    throw new Error(`Plantilla no definida: ${kind}`)
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Helios CRM'

  const instructions = workbook.addWorksheet('Instrucciones', {
    views: [{ showGridLines: true }],
  })
  instructions.getColumn(1).width = 96
  instructions.mergeCells('A1:A12')
  const noteCell = instructions.getCell('A1')
  noteCell.value = config.instructions
  noteCell.alignment = { wrapText: true, vertical: 'top' }
  noteCell.font = { size: 11 }

  const sheet = workbook.addWorksheet(config.sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  config.columns.forEach((column, index) => {
    const col = sheet.getColumn(index + 1)
    col.width = Math.max(column.label.length + 2, 14)
    const headerCell = sheet.getCell(1, index + 1)
    headerCell.value = column.label
    headerCell.font = column.required ? { bold: true } : {}
    headerCell.alignment = { vertical: 'middle' }

    const sampleCell = sheet.getCell(2, index + 1)
    if (column.sample !== undefined && column.sample !== '') {
      sampleCell.value = column.sample
    }
    if (column.key === 'documentId') {
      sampleCell.numFmt = '@'
    }
  })

  const listValidations = [...(config.listValidations ?? [])]
  if (config.documentTypeColumnKey) {
    listValidations.push({
      columnKey: config.documentTypeColumnKey,
      values: ['cedula', 'pasaporte', 'otro'],
      errorTitle: 'Tipo de documento',
      error: 'Elige cedula, pasaporte u otro.',
    })
  }
  applyColumnListValidations(sheet, config.columns, listValidations)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `helios-crm-import-${config.fileSlug}-plantilla.xlsx`
  anchor.click()
  URL.revokeObjectURL(url)
}

// Compatibilidad con imports anteriores
export const AGENDA_IMPORT_TEMPLATE_NOTE = IMPORT_EXCEL_TEMPLATE_CONFIG.agenda.instructions
export const AGENDA_IMPORT_COLUMNS = IMPORT_EXCEL_TEMPLATE_CONFIG.agenda.columns
export async function downloadAgendaImportTemplate() {
  return downloadImportExcelTemplate('agenda')
}
