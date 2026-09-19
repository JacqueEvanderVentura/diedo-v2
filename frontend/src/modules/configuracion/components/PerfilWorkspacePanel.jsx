import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { UserCircle } from 'lucide-react'
import { administrationGateway } from '@/services/administrationApi'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { mapWorkspaceSettingsFromApi } from '../lib/workspaceSettings'
import { configPageClass } from '../lib/pageShell'

export default function PerfilWorkspacePanel({ embedded = false }) {
  const online = useSessionStore((state) => state.status === 'online')
  const user = useSessionStore((state) => state.user)
  const canReadWorkspace = useSessionStore((state) => state.hasPermission('workspace.read'))
  const canUpdateWorkspace = useSessionStore((state) => state.hasPermission('workspace.update'))
  const localSettings = useConfigStore((state) => state.settings)
  const updateLocalSettings = useConfigStore((state) => state.updateSettings)

  const [apiSettings, setApiSettings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [businessName, setBusinessName] = useState('')

  const settings = useMemo(
    () => (online && apiSettings ? apiSettings : localSettings),
    [apiSettings, localSettings, online],
  )

  const load = useCallback(async () => {
    if (!online) {
      setBusinessName(localSettings.businessName || '')
      return
    }
    if (!canReadWorkspace) return
    setLoading(true)
    try {
      const result = await administrationGateway.read('workspaceSettings')
      if (result?.data) {
        const mapped = mapWorkspaceSettingsFromApi(result.data)
        setApiSettings(mapped)
        updateLocalSettings({
          businessName: mapped.businessName,
          taxDefault: mapped.taxDefault,
          version: mapped.version,
        })
        setBusinessName(mapped.businessName || '')
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo cargar el nombre del negocio.')
    } finally {
      setLoading(false)
    }
  }, [canReadWorkspace, localSettings.businessName, online, updateLocalSettings])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  useEffect(() => {
    if (!loading && !saving) {
      setBusinessName(settings.businessName || '')
    }
  }, [loading, saving, settings.businessName])

  const save = async () => {
    if (saving || (online && !canUpdateWorkspace)) return
    setSaving(true)
    try {
      const trimmed = businessName.trim()
      if (online) {
        const result = await administrationGateway.mutate('updateWorkspaceSettings', {
          name: trimmed,
          taxDefaultRate: Number(settings.taxDefault) || 0,
          version: settings.version,
        })
        const mapped = mapWorkspaceSettingsFromApi(result)
        setApiSettings(mapped)
        updateLocalSettings({
          businessName: mapped.businessName,
          taxDefault: mapped.taxDefault,
          version: mapped.version,
        })
        setBusinessName(mapped.businessName || '')
      } else {
        updateLocalSettings({ businessName: trimmed })
      }
      toast.success('Nombre del negocio guardado')
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const displayName = user?.name || user?.email || 'Usuario'
  const canEditBusiness = !online || canUpdateWorkspace

  return (
    <div className={configPageClass(embedded, 'max-w-2xl')} data-testid="perfil-workspace-panel">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
          <UserCircle className="h-5 w-5 text-indigo-500" />
          Perfil
        </h3>
        <p className="mt-1 text-sm text-slate-500">Tu cuenta y el nombre con el que te presentas a clientes.</p>
      </div>

      <Card className="mb-4 p-6">
        <p className="text-sm font-medium text-slate-600">Cuenta</p>
        <p className="mt-1 font-semibold text-slate-900">{displayName}</p>
        {user?.email && <p className="text-sm text-slate-500">{user.email}</p>}
        {user?.role && <p className="mt-2 text-xs text-slate-400">Rol: {user.role}</p>}
      </Card>

      <Card className="p-6">
        <h4 className="font-semibold text-slate-800">Nombre del negocio</h4>
        <p className="mt-1 text-sm text-slate-500">
          Aparece en mensajes de WhatsApp como <code className="text-xs text-slate-600">{'{{empresa}}'} </code>
           (por ejemplo: &quot;soy de Cortinaje&quot;). No es el nombre del lead.
        </p>
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre comercial</label>
          <Input
            value={businessName}
            disabled={loading || saving || !canEditBusiness}
            onChange={(event) => setBusinessName(event.target.value)}
            placeholder="Ej. Cortinaje del Este"
            data-testid="perfil-business-name"
          />
        </div>
        {online && !canUpdateWorkspace && (
          <p className="mt-2 text-xs text-slate-400">Se requiere el permiso workspace.update para modificar este campo.</p>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={loading || saving || !canEditBusiness}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
