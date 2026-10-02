import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { administrationApi } from '@/services/administrationApi'
import { useSessionStore } from '@/stores/sessionStore'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { configPageClass } from '../lib/pageShell'

export default function WorkspaceDataResetPanel({ embedded = false }) {
  const navigate = useNavigate()
  const online = useSessionStore((state) => state.status === 'online')
  const user = useSessionStore((state) => state.user)
  const logout = useSessionStore((state) => state.logout)
  const workspaceSlug = user?.workspace?.slug
  const workspaceName = user?.workspace?.name || 'tu negocio'

  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!online || !workspaceSlug) {
    return (
      <p className={embedded ? 'text-sm text-slate-500' : configPageClass}>
        Disponible solo con conexión al servidor.
      </p>
    )
  }

  const confirmReset = async () => {
    setBusy(true)
    try {
      await administrationApi.resetWorkspaceData({ confirmationSlug: workspaceSlug })
      setDialogOpen(false)
      toast.success('Data operativa reiniciada. Inicia sesión de nuevo.')
      await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err.message || 'No se pudo reiniciar la data operativa.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="config-data-reset-panel">
      <p className="text-sm leading-relaxed text-slate-600">
        Elimina ventas, clientes, inventario, CRM, chat y adjuntos de{' '}
        <span className="font-medium text-slate-800">{workspaceName}</span>. No borra usuarios,
        plan ni sucursales. Cierra <strong>todas</strong> las sesiones activas, incluida la tuya.
      </p>
      <Button
        type="button"
        variant="danger"
        disabled={busy}
        onClick={() => setDialogOpen(true)}
        data-testid="config-data-reset-trigger"
      >
        Reiniciar data operativa
      </Button>
      <ConfirmDialog
        open={dialogOpen}
        onClose={() => !busy && setDialogOpen(false)}
        onConfirm={confirmReset}
        title="Reiniciar data operativa"
        description={`Se borrará toda la información operativa de «${workspaceName}». Tendrás que volver a iniciar sesión.`}
        confirmLabel="Reiniciar data"
        confirmPhrase={workspaceSlug}
        confirmPhraseLabel={`Escribe el slug «${workspaceSlug}» para confirmar`}
        busy={busy}
        testId="config-data-reset-dialog"
      />
    </div>
  )
}
