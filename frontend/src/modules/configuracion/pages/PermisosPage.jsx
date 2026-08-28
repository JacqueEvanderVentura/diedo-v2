import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, X, Save } from 'lucide-react'
import { useConfigStore, USER_ROLES } from '@/stores/configStore'
import { PERMISSION_MODULES, actionId } from '@/data/permisos'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

function PermCell({ granted, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mx-auto flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        granted ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-red-50 text-red-400 hover:bg-red-100'
      )}
    >
      {granted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
    </button>
  )
}

export default function PermisosPage() {
  const permissions = useConfigStore((s) => s.permissions)
  const togglePermission = useConfigStore((s) => s.togglePermission)
  const getPermissionSummary = useConfigStore((s) => s.getPermissionSummary)
  const [highlightRole, setHighlightRole] = useState('Administrador')

  const summary = useMemo(() => getPermissionSummary(), [permissions, getPermissionSummary])

  const save = () => toast.success('Permisos guardados correctamente')

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="permisos-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-500">Haz clic en las celdas para activar o desactivar permisos</p>
        <Button onClick={save} data-testid="permisos-save"><Save className="h-4 w-4" /> Guardar Cambios</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {USER_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setHighlightRole(role)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              highlightRole === role ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {role}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <h3 className="font-heading text-lg font-bold text-slate-800">Roles del Sistema</h3>
        {PERMISSION_MODULES.map((mod) => (
          <Card key={mod.id} className="overflow-hidden" data-testid={`perm-module-${mod.id}`}>
            <div className="border-b border-slate-100 px-6 py-4">
              <h4 className="font-semibold text-slate-800">{mod.name}</h4>
              <p className="text-sm text-slate-500">{mod.description}</p>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-3">Acción</th>
                    {USER_ROLES.map((role) => (
                      <th key={role} className={cn('px-3 py-3 text-center', highlightRole === role && 'bg-blue-50/50')}>{role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mod.actions.map((action) => {
                    const id = actionId(mod.id, action)
                    return (
                      <tr key={id}>
                        <td className="px-6 py-3 font-medium text-slate-700">{action}</td>
                        {USER_ROLES.map((role) => (
                          <td key={role} className={cn('px-3 py-2 text-center', highlightRole === role && 'bg-blue-50/30')}>
                            <PermCell
                              granted={!!permissions[id]?.[role]}
                              onClick={() => togglePermission(id, role)}
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6" data-testid="permisos-summary">
        <h3 className="mb-4 font-heading text-lg font-bold text-slate-800">Resumen por Rol</h3>
        <div className="space-y-4">
          {summary.map((s) => (
            <div key={s.role}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">{s.role}</span>
                <span className="text-slate-500">{s.granted} / {s.total} ({s.pct}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
