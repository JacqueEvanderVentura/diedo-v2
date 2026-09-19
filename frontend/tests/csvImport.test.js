import { describe, expect, it } from 'vitest'
import {
  chunkRows,
  deriveCustomerDisplayName,
  formatImportApiError,
  mapCsvRowToApi,
  parseCsv,
  prepareActivityRows,
  prepareCustomerRows,
} from '@/modules/configuracion/lib/csvImport'

describe('csvImport', () => {
  it('parses quoted csv rows', () => {
    const rows = parseCsv('externalId,name\n1,"Juan, Sr."\n')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Juan, Sr.')
  })

  it('maps pipeline flags and numbers', () => {
    const mapped = mapCsvRowToApi({
      externalId: '99',
      convert: 'true',
      value: '1200',
      stage: 'contactado',
    })
    expect(mapped.externalId).toBe('99')
    expect(mapped.convert).toBe(true)
    expect(mapped.value).toBe(1200)
  })

  it('maps empty company to empty string, not null', () => {
    const mapped = mapCsvRowToApi({
      externalId: '1',
      name: 'Lead',
      company: '',
      stage: 'contactado',
      convert: 'false',
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
})
