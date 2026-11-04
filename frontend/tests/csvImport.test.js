import { describe, expect, it } from 'vitest'
import {
  chunkRows,
  deriveCustomerDisplayName,
  formatImportApiError,
  getImportTemplateColumns,
  mapCsvRowToApi,
  normalizeCsvHeaderKey,
  parseCsv,
  prepareActivityRows,
  prepareAgendaRows,
  prepareCustomerRows,
  toPipelineImportItem,
  validateImportTemplateHeaders,
} from '@/modules/configuracion/lib/csvImport'

describe('csvImport', () => {
  it('parses quoted csv rows', () => {
    const rows = parseCsv('externalId,name\n1,"Juan, Sr."\n')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Juan, Sr.')
  })

  it('maps pipeline stage and value to API fields', () => {
    const item = toPipelineImportItem(mapCsvRowToApi({
      name: 'Lead',
      company: '',
      stage: 'propuesta',
      value: '1500',
      isClient: 'false',
    }))
    expect(item.status).toBe('propuesta')
    expect(item.stage).toBeUndefined()
    expect(item.pipelineValue).toBe(1500)
    expect(item.value).toBeUndefined()
    expect(item.convert).toBe(false)
    expect(item.isClient).toBeUndefined()
  })

  it('maps pipeline isClient to convert for API', () => {
    const item = toPipelineImportItem(mapCsvRowToApi({
      name: 'Lead',
      isClient: 'true',
    }))
    expect(item.convert).toBe(true)
  })

  it('maps pipeline flags and numbers', () => {
    const mapped = mapCsvRowToApi({
      externalId: '99',
      isClient: 'true',
      value: '1200',
      stage: 'contactado',
    })
    expect(mapped.externalId).toBe('99')
    expect(mapped.isClient).toBe(true)
    expect(mapped.value).toBe(1200)
  })

  it('maps empty company to empty string, not null', () => {
    const mapped = mapCsvRowToApi({
      externalId: '1',
      name: 'Lead',
      company: '',
      stage: 'contactado',
      isClient: 'false',
      value: '0',
    })
    expect(mapped.company).toBe('')
    expect(mapped.company).not.toBeNull()
  })

  it('chunks rows for batch upload', () => {
    expect(chunkRows([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })

  it('derives customer display name from parts', () => {
    expect(deriveCustomerDisplayName({ firstName: 'Ana', lastName: 'López' })).toBe('Ana López')
    expect(deriveCustomerDisplayName({ externalId: '19395785' })).toBe('Cliente 19395785')
  })

  it('prepares customer rows with derived display names', () => {
    const { validRows, invalidRows } = prepareCustomerRows([
      { externalId: '1', firstName: 'Juan', lastName: 'Pérez' },
      { externalId: '2' },
    ])
    expect(validRows).toHaveLength(2)
    expect(validRows[0].displayName).toBe('Juan Pérez')
    expect(validRows[1].displayName).toBe('Cliente 2')
    expect(invalidRows).toHaveLength(0)
  })

  it('drops helper columns from activity import rows', () => {
    const rows = prepareActivityRows([
      {
        externalId: '1',
        leadExternalId: '9',
        contactName: 'Juan Pérez',
        title: 'Llamada',
        description: 'Seguimiento',
        dueAt: '2026-09-20T10:00:00.000Z',
      },
    ])
    expect(rows[0]).toEqual({
      externalId: '1',
      leadExternalId: '9',
      title: 'Llamada',
      description: 'Seguimiento',
      dueAt: '2026-09-20T10:00:00.000Z',
    })
  })

  it('labels import api errors with field names', () => {
    const message = formatImportApiError({
      message: 'El texto es demasiado corto.',
      parameter: 'items[9].displayName',
    })
    expect(message).toContain('Nombre para mostrar')
  })

  it('parses multiline quoted fields', () => {
    const rows = parseCsv('externalId,name,notes\n1,Ana,"linea 1\nlinea 2"\n')
    expect(rows).toHaveLength(1)
    expect(rows[0].notes).toBe('linea 1\nlinea 2')
  })

  it('accepts customer csv with full template headers', () => {
    const headers = getImportTemplateColumns('customers')
    const result = validateImportTemplateHeaders('customers', headers)
    expect(result.ok).toBe(true)
  })

  it('rejects customer csv that only has name column', () => {
    const result = validateImportTemplateHeaders('customers', ['name', 'email', 'phone'])
    expect(result.ok).toBe(false)
    expect(result.missing.length).toBeGreaterThan(0)
  })

  it('accepts agenda csv with full template headers', () => {
    const headers = getImportTemplateColumns('agenda')
    const result = validateImportTemplateHeaders('agenda', headers)
    expect(result.ok).toBe(true)
  })

  it('prepares valid agenda rows with defaults', () => {
    const { validRows, invalidRows } = prepareAgendaRows([
      {
        externalId: 'c1',
        date: '2026-11-15',
        time: '10:00',
        duration: '',
        customerName: 'María Pérez',
        customerPhone: '8095550101',
        customerEmail: 'maria@example.com',
        serviceName: 'Facial',
        resourceName: 'Cabina 1',
        specialistName: 'Dra. Soto',
        price: '2500',
        notes: '',
      },
    ])
    expect(invalidRows).toHaveLength(0)
    expect(validRows[0]).toMatchObject({
      externalId: 'c1',
      date: '2026-11-15',
      time: '10:00',
      duration: 30,
      customerName: 'María Pérez',
      customerPhone: '8095550101',
      customerEmail: 'maria@example.com',
      price: 2500,
    })
  })

  it('accepts agenda rows without resourceName', () => {
    const { validRows, invalidRows } = prepareAgendaRows([
      {
        date: '2026-11-15',
        time: '10:00',
        customerName: 'Ana',
        resourceName: '',
      },
    ])
    expect(invalidRows).toHaveLength(0)
    expect(validRows[0].resourceName).toBeUndefined()
  })

  it('accepts agenda rows with phone only when customer name is empty', () => {
    const { validRows, invalidRows } = prepareAgendaRows([
      {
        date: '2026-11-15',
        time: '10:00',
        customerName: '',
        customerPhone: '8095550101',
      },
    ])
    expect(invalidRows).toHaveLength(0)
    expect(validRows[0].customerName).toBeUndefined()
    expect(validRows[0].customerPhone).toBe('8095550101')
  })

  it('rejects agenda rows with invalid date or duration', () => {
    const { validRows, invalidRows } = prepareAgendaRows([
      {
        date: '15-11-2026',
        time: '10:00',
        customerName: 'Ana',
        resourceName: 'Cabina 1',
      },
      {
        date: '2026-11-15',
        time: '10:00',
        duration: '2',
        customerName: 'Ana',
        resourceName: 'Cabina 1',
      },
    ])
    expect(validRows).toHaveLength(0)
    expect(invalidRows).toHaveLength(2)
    expect(invalidRows[0].message).toContain('Fecha')
    expect(invalidRows[1].message).toContain('Duración')
  })

  it('normalizes spaced document headers for agenda csv', () => {
    expect(normalizeCsvHeaderKey('Document Type')).toBe('documentType')
    expect(normalizeCsvHeaderKey('Document Id')).toBe('documentId')
  })

  it('accepts agenda csv with optional document columns', () => {
    const headers = [
      ...getImportTemplateColumns('agenda'),
      'documentType',
      'documentId',
    ]
    const result = validateImportTemplateHeaders('agenda', headers)
    expect(result.ok).toBe(true)
  })

  it('forwards optional document columns on agenda rows', () => {
    const { validRows, invalidRows } = prepareAgendaRows([
      {
        date: '2026-11-15',
        time: '10:00',
        customerName: 'Portal',
        customerPhone: '8095550202',
        documentType: 'pasaporte',
        documentId: 'AB123456',
      },
    ])
    expect(invalidRows).toHaveLength(0)
    expect(validRows[0]).toMatchObject({
      documentType: 'pasaporte',
      documentId: 'AB123456',
    })
  })
})
