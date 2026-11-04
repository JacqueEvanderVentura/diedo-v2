import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import {
  IMPORT_EXCEL_TEMPLATE_CONFIG,
  downloadImportExcelTemplate,
} from '@/modules/configuracion/lib/importExcelTemplates'

describe('importExcelTemplates', () => {
  it('builds agenda sheet with Document Type validation and bold required headers', async () => {
    const config = IMPORT_EXCEL_TEMPLATE_CONFIG.agenda
    const workbook = new ExcelJS.Workbook()
    const instructions = workbook.addWorksheet('Instrucciones')
    instructions.getCell('A1').value = config.instructions
    const sheet = workbook.addWorksheet(config.sheetName)
    config.columns.forEach((column, index) => {
      sheet.getCell(1, index + 1).value = column.label
      sheet.getCell(1, index + 1).font = column.required ? { bold: true } : {}
    })
    const documentTypeIndex = config.columns.findIndex((c) => c.key === 'documentType') + 1
    sheet.dataValidations.add(`H2:H5000`, {
      type: 'list',
      allowBlank: true,
      formulae: ['"cedula,pasaporte,otro"'],
    })
    expect(sheet.getCell(1, 8).value).toBe('Document Type')
    expect(sheet.getCell(1, 9).value).toBe('Document Id')
    expect(sheet.getCell(1, 2).font?.bold).toBe(true)
    expect(documentTypeIndex).toBe(8)
  })

  it('defines instructions sheet content for each import kind', () => {
    ;['pipeline', 'agenda', 'customers', 'activities'].forEach((kind) => {
      expect(IMPORT_EXCEL_TEMPLATE_CONFIG[kind].instructions).toContain('negrita')
      expect(IMPORT_EXCEL_TEMPLATE_CONFIG[kind].columns.length).toBeGreaterThan(2)
    })
  })

  it('uses Document Type / Document Id labels where document columns exist', () => {
    const agendaDoc = IMPORT_EXCEL_TEMPLATE_CONFIG.agenda.columns.filter((c) => c.key.includes('document'))
    expect(agendaDoc.map((c) => c.label)).toEqual(['Document Type', 'Document Id'])
  })

  it('defines customerType and acquisitionSource list validations', () => {
    const config = IMPORT_EXCEL_TEMPLATE_CONFIG.customers
    const customerTypeRule = config.listValidations.find((v) => v.columnKey === 'customerType')
    const sourceRule = config.listValidations.find((v) => v.columnKey === 'acquisitionSource')
    expect(customerTypeRule?.values).toEqual(['person', 'business'])
    expect(sourceRule?.values).toContain('whatsapp')
    expect(sourceRule?.values).toContain('otros')
  })

  it('defines pipeline stage and isClient list validations', () => {
    const config = IMPORT_EXCEL_TEMPLATE_CONFIG.pipeline
    expect(config.listValidations.find((v) => v.columnKey === 'stage')?.values).toContain('contactado')
    expect(config.listValidations.find((v) => v.columnKey === 'isClient')?.values).toEqual(['true', 'false'])
  })

  it('exposes download helper', () => {
    expect(typeof downloadImportExcelTemplate).toBe('function')
  })
})
