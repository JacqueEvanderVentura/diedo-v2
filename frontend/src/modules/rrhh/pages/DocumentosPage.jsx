import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Building2, Users, Calendar, Printer, Download, Save } from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useConfigStore } from '@/stores/configStore'
import { DOCUMENT_TEMPLATES } from '@/data/rrhh'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { buildDocumentContent, buildDocumentPrintHtml, exportDocumentPdf } from '../lib/documents'
import { fullName } from '../lib/rrhh'
import { printHtml } from '@/lib/print'
import { cn } from '@/lib/utils'

const ICONS = { FileText, Building2, Users, Calendar }

export default function DocumentosPage() {
  const employees = useRrhhStore((s) => s.employees)
  const documentHistory = useRrhhStore((s) => s.documentHistory)
  const addDocumentRecord = useRrhhStore((s) => s.addDocumentRecord)
  const branches = useConfigStore((s) => s.branches)

  const [templateId, setTemplateId] = useState('bancaria')
  const [employeeId, setEmployeeId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [includeSalary, setIncludeSalary] = useState(true)

  const employee = employees.find((e) => e.id === employeeId)
  const branch = branches.find((b) => b.id === employee?.branchId)

  const preview = useMemo(() => {
    if (!employee) return null
    return buildDocumentContent(templateId, { employee, branch, includeSalary, issueDate })
  }, [templateId, employee, branch, includeSalary, issueDate])

  const showSalaryToggle = templateId === 'bancaria'

  const saveToHistory = () => {
    if (!employee) return toast.error('Selecciona un empleado')
    addDocumentRecord({ templateId, employeeId, issueDate, includeSalary })
    toast.success('Documento guardado en historial')
  }

  const downloadPdf = () => {
    if (!employee) return toast.error('Selecciona un empleado')
    exportDocumentPdf({ templateId, employee, branch, includeSalary, issueDate })
    toast.success('PDF descargado')
  }

  const printDoc = () => {
    if (!preview) return toast.error('Selecciona un empleado')
    printHtml(buildDocumentPrintHtml(preview))
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="rrhh-documentos">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-heading font-semibold text-slate-900">Plantilla</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DOCUMENT_TEMPLATES.map((t) => {
                const Icon = ICONS[t.icon] || FileText
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-colors',
                      templateId === t.id ? 'border-blue-300 bg-blue-50' : 'border-slate-100 hover:border-slate-200'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 mb-2', templateId === t.id ? 'text-blue-600' : 'text-slate-400')} />
                    <p className="font-medium text-slate-800">{t.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{t.desc}</p>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 font-heading font-semibold text-slate-900">Datos del documento</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Empleado</label>
                <Select
                  value={employeeId}
                  onChange={setEmployeeId}
                  placeholder="Seleccionar empleado"
                  options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: fullName(e) }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Fecha de emisión</label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              {showSalaryToggle && (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <input type="checkbox" checked={includeSalary} onChange={(e) => setIncludeSalary(e.target.checked)} className="h-4 w-4" />
                  <span className="text-sm font-medium text-slate-700">Incluir salario</span>
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={printDoc}><Printer className="h-4 w-4" /> Imprimir</Button>
                <Button variant="secondary" onClick={downloadPdf}><Download className="h-4 w-4" /> Descargar PDF</Button>
                <Button onClick={saveToHistory}><Save className="h-4 w-4" /> Guardar</Button>
              </div>
            </div>
          </Card>
        </div>

        <Card className="sticky top-6 p-8 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
          <h3 className="mb-6 font-heading font-semibold text-slate-900">Vista previa</h3>
          {!preview ? (
            <p className="text-sm text-slate-500">Selecciona un empleado para ver la vista previa.</p>
          ) : (
            <div className="space-y-4 text-sm leading-relaxed text-slate-700">
              <div className="text-xs text-slate-400">
                <p className="font-semibold text-slate-600">{preview.company}</p>
                <p>{preview.department}</p>
                <p className="mt-2">Ref: {preview.ref} · {preview.dateStr}</p>
              </div>
              <h4 className="text-center font-heading text-lg font-bold text-slate-900">{preview.title}</h4>
              {preview.body.map((para, i) => (
                para === '' ? <br key={i} /> : <p key={i}>{para}</p>
              ))}
              <div className="pt-8 text-xs">
                <p className="font-bold">{preview.company.toUpperCase()}</p>
                <p>Dirección de Recursos Humanos</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {documentHistory.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 font-heading font-semibold text-slate-900">Historial reciente</h3>
          <div className="space-y-2">
            {documentHistory.slice(0, 5).map((d) => {
              const emp = employees.find((e) => e.id === d.employeeId)
              const tpl = DOCUMENT_TEMPLATES.find((t) => t.id === d.templateId)
              return (
                <div key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
                  <span>{tpl?.label} — {fullName(emp)}</span>
                  <span className="text-slate-400">{d.issueDate}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
