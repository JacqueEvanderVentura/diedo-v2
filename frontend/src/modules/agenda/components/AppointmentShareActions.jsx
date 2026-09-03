import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useStaffName } from '@/modules/rrhh/lib/staff'
import { statusMeta } from '@/stores/agendaStore'
import {
  buildShareCardModel,
  copyAppointmentShareImage,
  downloadAppointmentShareImage,
  shareCardFilename,
} from '../lib/shareCard'
import { isProximoAppointment } from '../lib/appointments'
import { cn } from '@/lib/utils'

export function AppointmentShareActions({ appointment, className }) {
  const [busy, setBusy] = useState(null)
  const staffName = useStaffName()

  const model = useMemo(() => {
    if (!appointment) return null
    const proximo = isProximoAppointment(appointment)
    const st = statusMeta(appointment.status)
    return buildShareCardModel(appointment, {
      staffName: staffName(appointment.employeeId),
      statusLabel: st.name,
      proximo,
      showAudit: false,
    })
  }, [appointment, staffName])

  const copyImage = async () => {
    if (!model) return
    setBusy('copy')
    try {
      await copyAppointmentShareImage(model)
      toast.success('Imagen copiada al portapapeles')
    } catch (err) {
      toast.error(err?.message || 'No se pudo copiar la imagen')
    } finally {
      setBusy(null)
    }
  }

  const downloadImage = async () => {
    if (!model || !appointment) return
    setBusy('download')
    try {
      await downloadAppointmentShareImage(model, shareCardFilename(appointment))
      toast.success('Imagen descargada')
    } catch {
      toast.error('No se pudo descargar la imagen')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn('flex w-[380px] gap-2', className)}>
      <Button
        variant="secondary"
        className="flex-1"
        onClick={copyImage}
        disabled={!!busy || !model}
        data-testid="share-copy"
      >
        <Copy className="h-4 w-4" /> Copiar imagen
      </Button>
      <Button className="flex-1" onClick={downloadImage} disabled={!!busy || !model} data-testid="share-download">
        <Download className="h-4 w-4" /> Descargar
      </Button>
    </div>
  )
}
