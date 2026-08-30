import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import writeExcelFile from 'write-excel-file/browser'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function sanitizeFilename(name) {
  return (name || 'export').replace(/[^\w\-]+/g, '_').slice(0, 80)
}

export function exportCsv({ title, columns, rows, filename }) {
  const headers = columns.map((c) => c.label)
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      columns
        .map((c) => {
          const val = row[c.key] ?? ''
          const str = String(val).replace(/"/g, '""')
          return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str
        })
        .join(',')
    ),
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${sanitizeFilename(filename || title)}.csv`)
}

export async function exportXlsx({ title, columns, rows, filename, sheetName = 'Datos' }) {
  const header = columns.map((column) => ({ value: column.label, fontWeight: 'bold' }))
  const data = rows.map((row) =>
    columns.map((column) => {
      const value = row[column.key]
      return ['string', 'number', 'boolean'].includes(typeof value) || value instanceof Date
        ? value
        : value == null
          ? null
          : String(value)
    })
  )
  const safeSheetName = sheetName.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Datos'
  await writeExcelFile([header, ...data], { sheet: safeSheetName }).toFile(
    `${sanitizeFilename(filename || title)}.xlsx`
  )
}

export function exportPdf({ title, columns, rows, filename, subtitle }) {
  const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait' })
  doc.setFontSize(16)
  doc.text(title, 14, 18)
  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(subtitle, 14, 26)
    doc.setTextColor(0)
  }
  autoTable(doc, {
    startY: subtitle ? 32 : 24,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ''))),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235] },
  })
  doc.save(`${sanitizeFilename(filename || title)}.pdf`)
}
