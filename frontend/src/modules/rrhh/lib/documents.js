import jsPDF from 'jspdf'
import { fullName, fmtDate } from './rrhh'

export function buildDocumentContent(templateId, { employee, branch, includeSalary, issueDate }) {
  const name = fullName(employee)
  const company = branch?.legalName || branch?.name || 'Empresa'
  const position = employee?.position || '—'
  const department = employee?.department || 'Operaciones'
  const salary = employee?.salary || 0
  const hireDate = employee?.hireDate ? fmtDate(employee.hireDate) : 'fecha de ingreso'
  const dateStr = fmtDate(issueDate)
  const ref = `DC-${new Date().getFullYear()}-${templateId.toUpperCase().slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`

  const templates = {
    certificado: {
      title: 'CERTIFICADO LABORAL',
      body: [
        'A quien corresponda,',
        '',
        `Por medio de la presente certificamos que ${name} labora en ${company} desde el ${hireDate}, desempeñando el cargo de ${position} en el departamento de ${department}.`,
        '',
        'Durante su permanencia ha demostrado responsabilidad, puntualidad y compromiso con las funciones asignadas.',
        '',
        'Este certificado se expide a solicitud del interesado para los fines que estime convenientes.',
      ],
    },
    bancaria: {
      title: 'CARTA DE CONFIRMACIÓN BANCARIA',
      body: [
        'A quien corresponda,',
        '',
        `Por medio de la presente, ${company} confirma que ${name} es empleado(a) activo(a) desde el ${hireDate}, desempeñando el cargo de ${position} en el departamento de ${department}.`,
        ...(includeSalary
          ? [`Su compensación mensual actual asciende a $${salary.toLocaleString('es-DO', { minimumFractionDigits: 2 })}, sujeto a las deducciones fiscales y beneficios correspondientes según la legislación vigente.`]
          : []),
        'Esta carta se expide a solicitud del empleado para ser presentada ante la institución bancaria que corresponda.',
      ],
    },
    recomendacion: {
      title: 'CARTA DE RECOMENDACIÓN',
      body: [
        'A quien corresponda,',
        '',
        `Es un placer recomendar a ${name}, quien se desempeñó como ${position} en ${company} desde el ${hireDate}.`,
        '',
        'Durante su tiempo con nosotros demostró profesionalismo, trabajo en equipo y excelente trato con clientes y compañeros.',
        '',
        'Sin duda alguna, recomendamos a esta persona para cualquier oportunidad laboral que se ajuste a su perfil.',
      ],
    },
    vacaciones: {
      title: 'CONSTANCIA DE VACACIONES',
      body: [
        'A quien corresponda,',
        '',
        `Por medio de la presente, ${company} hace constar que el(la) colaborador(a) ${name}, con cargo de ${position}, tiene derecho a ${employee?.vacationDays ?? 0} días de vacaciones disponibles según política interna.`,
        '',
        'Esta constancia se expide para fines administrativos y de registro.',
      ],
    },
  }

  const t = templates[templateId] || templates.certificado
  return { ...t, company, name, dateStr, ref, department: 'División de Recursos Humanos' }
}

export function exportDocumentPdf({ templateId, employee, branch, includeSalary, issueDate }) {
  const doc = buildDocumentContent(templateId, { employee, branch, includeSalary, issueDate })
  const pdf = new jsPDF()
  const margin = 20
  let y = 25

  pdf.setFontSize(11)
  pdf.text(doc.company, margin, y)
  y += 6
  pdf.setFontSize(9)
  pdf.setTextColor(100)
  pdf.text(doc.department, margin, y)
  pdf.setTextColor(0)
  pdf.text(`Ref: ${doc.ref}`, 150, 20)
  pdf.text(`Fecha: ${doc.dateStr}`, 150, 26)

  y += 20
  pdf.setFontSize(14)
  pdf.text(doc.title, 105, y, { align: 'center' })
  y += 15

  pdf.setFontSize(11)
  doc.body.forEach((para) => {
    if (para === '') {
      y += 6
      return
    }
    const lines = pdf.splitTextToSize(para, 170)
    pdf.text(lines, margin, y)
    y += lines.length * 6 + 4
  })

  y += 15
  pdf.setFontSize(10)
  pdf.text(doc.company.toUpperCase(), margin, y)
  pdf.text('Dirección de Recursos Humanos', margin, y + 6)

  pdf.save(`${doc.title.replace(/\s+/g, '_')}_${employee?.id || 'doc'}.pdf`)
}
