import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { useSessionStore } from '@/stores/sessionStore'
import { cn } from '@/lib/utils'

const OPTIONS = [
  {
    id: 'standard',
    title: 'CRM Standard',
    description: 'Overview, leads, pipeline, seguimientos, cotizaciones y ventas en módulos separados.',
  },
  {
    id: 'simplified',
    title: 'CRM Simplificado',
    description: 'Una sola pantalla de ventas para registrar leads, seguimientos y cobros.',
  },
]

export default function CrmModePanel({ embedded = false }) {
  const navigate = useNavigate()
  const uiMode = useCrmStore((state) => state.uiMode)
  const uiModeVersion = useCrmStore((state) => state.uiModeVersion)
  const ensureWorkspaceSettings = useCrmStore((state) => state.ensureWorkspaceSettings)
  const updateUiMode = useCrmStore((state) => state.updateUiMode)
  const canManage = useSessionStore((state) => state.hasPermission('crm.manage'))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ensureWorkspaceSettings().catch(() => {})
  }, [ensureWorkspaceSettings])

  const selectMode = async (nextMode) => {
    if (!canManage || nextMode === uiMode || saving) return
    setSaving(true)
    try {
      await updateUiMode(nextMode)
      toast.success(
        nextMode === 'simplified'
          ? 'CRM Simplificado activado'
          : 'CRM Standard activado'
      )
      navigate(nextMode === 'simplified' ? '/crm/workspace' : '/crm')
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar el modo del CRM')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn('space-y-4', embedded ? 'pt-2' : 'rounded-2xl border border-slate-100 bg-white p-6 shadow-soft')}
      data-testid="crm-mode-panel"
    >
      {!embedded && (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-bold text-slate-900">Modo CRM</h3>
            <p className="text-sm text-slate-500">Elige la experiencia de ventas para todo el workspace.</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const active = uiMode === option.id
          return (
            <button
              key={option.id}
              type="button"
              disabled={!canManage || saving}
              data-testid={`crm-mode-${option.id}`}
              onClick={() => selectMode(option.id)}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                active
                  ? 'border-blue-300 bg-blue-50/80 ring-1 ring-blue-200'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                !canManage && 'cursor-not-allowed opacity-70'
              )}
            >
              <p className="font-semibold text-slate-900">{option.title}</p>
              <p className="mt-1 text-sm text-slate-500">{option.description}</p>
              {active && (
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-600">Activo</p>
              )}
            </button>
          )
        })}
      </div>

      {!canManage && (
        <p className="text-sm text-slate-500">Necesitas permiso de administración del CRM para cambiar este ajuste.</p>
      )}

      <p className="text-xs text-slate-400" data-testid="crm-mode-version">
        Versión de configuración: {uiModeVersion}
      </p>
    </div>
  )
}
