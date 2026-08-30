import { useMemo, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Check, X, Save } from 'lucide-react'
import { useConfigStore, USER_ROLES } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { PERMISSION_MODULES, actionId } from '@/data/permisos'
import { permissionsApi } from '@/services/permissionsApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileCardHeader,
} from '@/components/ui/ResponsiveList'
import { configPageClass } from '../lib/pageShell'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { cn } from '@/lib/utils'

function PermCell({ granted, onClick, disabled = false, testId, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      aria-label={label}
      className={cn(
        'mx-auto flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        granted ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-red-50 text-red-400 hover:bg-red-100',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      {granted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
    </button>
  )
}

function PermModuleCard({ mod, actions, highlightRole, permissions, togglePermission }) {
  const rows = useMemo(
    () => actions.map((action) => ({ action, id: actionId(mod.id, action) })),
    [actions, mod.id]
  )

  const { rows: sortedActions, sortKey, sortDir, toggleSort } = useSortedRows(rows, {
    defaultSort: { key: 'action', dir: 'asc' },
    accessors: { action: (r) => r.action },
  })

  return (
    <Card className="overflow-hidden" data-testid={`perm-module-${mod.id}`}>
      <div className="border-b border-slate-100 px-6 py-4">
        <h4 className="font-semibold text-slate-800">{mod.name}</h4>
        <p className="text-sm text-slate-500">{mod.description}</p>
      </div>
      <ResponsiveList wide columnCount={6}>
        <ResponsiveTable testId={`perm-module-table-${mod.id}`} wrapCard={false}>
          <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <SortableTh column="action" className="px-6 py-3">Acción</SortableTh>
                {USER_ROLES.map((role) => (
                  <th key={role} className={cn('px-3 py-3 text-center', highlightRole === role && 'bg-blue-50/50')}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedActions.map(({ action, id }) => (
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
              ))}
            </tbody>
          </table>
          </SortableTableProvider>
        </ResponsiveTable>
        <ResponsiveCards testId={`perm-module-cards-${mod.id}`} className="p-4">
          {sortedActions.map(({ action, id }) => (
            <MobileCard key={id} testId={`perm-card-${id}`}>
              <MobileCardHeader title={action} />
              <div className="mt-3 space-y-2">
                {USER_ROLES.map((role) => (
                  <div key={role} className={cn('flex items-center justify-between rounded-lg px-3 py-2', highlightRole === role && 'bg-blue-50/50')}>
                    <span className="text-sm font-medium text-slate-600">{role}</span>
                    <PermCell
                      granted={!!permissions[id]?.[role]}
                      onClick={() => togglePermission(id, role)}
                    />
                  </div>
                ))}
              </div>
            </MobileCard>
          ))}
        </ResponsiveCards>
      </ResponsiveList>
    </Card>
  )
}

function ApiPermModuleCard({ mod, roles, grants, onToggle, highlightRoleId, canEdit }) {
  return (
    <Card className="overflow-hidden" data-testid={`api-perm-module-${mod.code}`}>
      <div className="border-b border-slate-100 px-6 py-4">
        <h4 className="font-semibold text-slate-800">{mod.name}</h4>
        <p className="text-sm text-slate-500">Permisos IAM / catálogo (API)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-6 py-3">Permiso</th>
              {roles.map((role) => (
                <th key={role.id} className={cn('px-3 py-3 text-center', highlightRoleId === role.id && 'bg-blue-50/50')}>{role.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {mod.permissions.map((perm) => (
              <tr key={perm.id}>
                <td className="px-6 py-3">
                  <p className="font-medium text-slate-700">{perm.name}</p>
                  <p className="text-xs text-slate-400">{perm.code}</p>
                </td>
                {roles.map((role) => {
                  const granted = grants[role.id]?.has(perm.id)
                  return (
                    <td key={role.id} className={cn('px-3 py-2 text-center', highlightRoleId === role.id && 'bg-blue-50/30')}>
                      <PermCell
                        granted={granted}
                        onClick={() => onToggle(role.id, perm.id)}
                        disabled={!canEdit}
                        testId={`api-perm-${role.id}-${perm.id}`}
                        label={`${perm.name}: ${role.name}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function DemoPermissionMatrix() {
  const permissions = useConfigStore((s) => s.permissions)
  const togglePermission = useConfigStore((s) => s.togglePermission)
  const getPermissionSummary = useConfigStore((s) => s.getPermissionSummary)
  const [highlightRole, setHighlightRole] = useState('Administrador')
  const [actionSearch, setActionSearch] = useState('')

  const summary = useMemo(() => getPermissionSummary(), [permissions, getPermissionSummary])

  const filterActions = (actions) => {
    const q = actionSearch.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((a) => a.toLowerCase().includes(q))
  }

  return (
    <>
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

      <DataFilterBar
        search={actionSearch}
        onSearchChange={setActionSearch}
        searchPlaceholder="Buscar acción..."
        testId="permisos-filters"
      />

      <div className="space-y-6">
        <h3 className="font-heading text-lg font-bold text-slate-800">Módulos locales (POS, Agenda, CRM…)</h3>
        {PERMISSION_MODULES.map((mod) => {
          const modActions = filterActions(mod.actions)
          if (modActions.length === 0 && actionSearch.trim()) return null
          return (
            <PermModuleCard
              key={mod.id}
              mod={mod}
              actions={modActions}
              highlightRole={highlightRole}
              permissions={permissions}
              togglePermission={togglePermission}
            />
          )
        })}
      </div>

      <Card className="p-6" data-testid="permisos-summary">
        <h3 className="mb-4 font-heading text-lg font-bold text-slate-800">Resumen por Rol (local)</h3>
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
    </>
  )
}

export default function PermisosPage({ embedded = false }) {
  const isOnline = useSessionStore((s) => s.isOnline())
  const isDemo = useSessionStore((s) => s.isDemo())
  const hasRoleManagePermission = useSessionStore((s) => s.hasPermission('role.manage'))
  const canManageRoles = useSessionStore((s) => s.hasWorkspacePermission('role.manage'))
  const refreshCurrentUser = useSessionStore((s) => s.refreshCurrentUser)

  const [apiMatrix, setApiMatrix] = useState(null)
  const [apiGrants, setApiGrants] = useState({})
  const [apiRoleVersions, setApiRoleVersions] = useState({})
  const [dirtyRoles, setDirtyRoles] = useState(new Set())
  const [highlightRoleId, setHighlightRoleId] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadMatrix = useCallback(async ({ notifyError = true } = {}) => {
    try {
      const matrix = await permissionsApi.matrix()
      const grants = {}
      const versions = {}
      matrix.roles.forEach((role) => {
        grants[role.id] = new Set()
        versions[role.id] = role.version
      })
      matrix.modules.forEach((mod) => {
        mod.permissions.forEach((perm) => {
          perm.grantedRoleIds.forEach((roleId) => {
            if (!grants[roleId]) grants[roleId] = new Set()
            grants[roleId].add(perm.id)
          })
        })
      })
      setApiMatrix(matrix)
      setApiGrants(grants)
      setApiRoleVersions(versions)
      setHighlightRoleId(matrix.roles[0]?.id || null)
      setDirtyRoles(new Set())
      return true
    } catch (err) {
      if (notifyError) toast.error(err.message || 'No se pudo cargar la matriz de permisos.')
      return false
    }
  }, [])

  useEffect(() => {
    if (isOnline) loadMatrix()
  }, [isOnline, loadMatrix])

  const toggleApiGrant = (roleId, permissionId) => {
    setApiGrants((prev) => {
      const next = { ...prev, [roleId]: new Set(prev[roleId] || []) }
      if (next[roleId].has(permissionId)) next[roleId].delete(permissionId)
      else next[roleId].add(permissionId)
      return next
    })
    setDirtyRoles((prev) => new Set(prev).add(roleId))
  }

  const save = async () => {
    if (isOnline) {
      if (!canManageRoles || !apiMatrix || dirtyRoles.size === 0) return
      setSaving(true)
      try {
        await permissionsApi.replaceBatch({
          roles: Array.from(dirtyRoles, (roleId) => ({
            roleId,
            permissionIds: Array.from(apiGrants[roleId] || []),
            version: apiRoleVersions[roleId],
          })),
        })
        const reloaded = await loadMatrix({ notifyError: false })
        if (!reloaded) throw new Error('Los permisos se guardaron, pero no se pudo recargar la matriz.')
        await refreshCurrentUser()
        toast.success('Permisos IAM guardados')
      } catch (err) {
        toast.error(err.message || 'No se pudieron guardar los permisos IAM.')
        setApiMatrix(null)
        setApiGrants({})
        setApiRoleVersions({})
        setDirtyRoles(new Set())
        const reconciled = await loadMatrix({ notifyError: false })
        if (!reconciled) toast.error('No se pudo reconciliar la matriz. Recarga la página antes de continuar.')
      } finally {
        setSaving(false)
      }
      return
    }
    if (isDemo) toast.success('Permisos locales guardados correctamente')
  }

  const canEditApi = isOnline && canManageRoles && !saving
  const canSave = isDemo || (canEditApi && Boolean(apiMatrix) && dirtyRoles.size > 0)

  return (
    <div className={configPageClass(embedded)} data-testid="permisos-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-500" data-testid="permisos-access-note">
          {isOnline && !canManageRoles
            ? hasRoleManagePermission
              ? 'Puedes consultar los permisos, pero gestionarlos requiere una asignación sobre todo el workspace.'
              : 'Puedes consultar los permisos, pero no tienes acceso para modificarlos.'
            : 'Haz clic en las celdas para activar o desactivar permisos'}
        </p>
        <Button onClick={save} disabled={saving || !canSave} data-testid="permisos-save"><Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar Cambios'}</Button>
      </div>

      {isOnline && apiMatrix && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Roles API</span>
            {apiMatrix.roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setHighlightRoleId(role.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  highlightRoleId === role.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {role.name}
              </button>
            ))}
          </div>
          {apiMatrix.modules.map((mod) => (
            <ApiPermModuleCard
              key={mod.code}
              mod={mod}
              roles={apiMatrix.roles}
              grants={apiGrants}
              onToggle={toggleApiGrant}
              highlightRoleId={highlightRoleId}
              canEdit={canEditApi}
            />
          ))}
        </div>
      )}

      {isDemo && <DemoPermissionMatrix />}
    </div>
  )
}
