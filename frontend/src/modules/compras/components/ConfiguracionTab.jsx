import { useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useComprasStore } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'

export function ConfiguracionTab() {
  const settings = useComprasStore((s) => s.settings)
  const updateSettings = useComprasStore((s) => s.updateSettings)
  const users = useConfigStore((s) => s.users)

  const [approverUserId, setApproverUserId] = useState(settings.approverUserId || '')
  const [notifyOnRequest, setNotifyOnRequest] = useState(settings.notifyOnRequest ?? true)

  const save = () => {
    updateSettings({ approverUserId, notifyOnRequest })
    toast.success('Configuración guardada')
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-900">Configuración de Compras y Flujos</h3>
        <p className="mt-1 text-sm text-slate-500">
          Define quién aprueba las solicitudes de compra y las preferencias del módulo.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">
              Aprobador designado para compras
            </label>
            <Select
              value={approverUserId}
              onChange={setApproverUserId}
              placeholder="Seleccionar usuario..."
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={notifyOnRequest}
              onChange={(e) => setNotifyOnRequest(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Notificar al aprobador cuando se cree una solicitud</span>
          </label>
        </div>

        <div className="mt-6">
          <Button onClick={save}><Save className="h-4 w-4" /> Guardar Configuración</Button>
        </div>
      </div>
    </div>
  )
}
