import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Table } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { cn } from '@/lib/utils'
import { exportCsv, exportPdf, exportXlsx } from '../lib/export'

const FORMATS = [
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'csv', label: 'CSV', icon: Table },
  { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
]

export function ExportMenu({
  title,
  columns,
  rows,
  filename,
  subtitle,
  variant = 'secondary',
  label = 'Exportar',
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event) => {
      if (btnRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const run = async (format) => {
    if (!rows?.length) {
      toast.error('No hay datos para exportar')
      return
    }

    const payload = { title, columns, rows, filename, subtitle }
    try {
      if (format === 'pdf') exportPdf(payload)
      else if (format === 'csv') exportCsv(payload)
      else await exportXlsx(payload)
      toast.success(`Exportado como ${format.toUpperCase()}`)
      setOpen(false)
    } catch {
      toast.error('No se pudo generar el archivo')
    }
  }

  return (
    <div className="relative" data-testid="export-menu">
      <Button
        ref={btnRef}
        variant={variant}
        onClick={() => setOpen((current) => !current)}
        data-testid="export-menu-trigger"
      >
        <Download className="h-4 w-4" />
        {label}
      </Button>
      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="end"
        width={176}
        estimatedHeight={132}
      >
        {FORMATS.map((format) => {
          const Icon = format.icon
          return (
            <button
              key={format.id}
              type="button"
              onClick={() => run(format.id)}
              data-testid={`export-${format.id}`}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm',
                'font-medium text-slate-700 transition-colors hover:bg-slate-50',
              )}
            >
              <Icon className="h-4 w-4 text-slate-400" />
              {format.label}
            </button>
          )
        })}
      </DropdownPanel>
    </div>
  )
}
