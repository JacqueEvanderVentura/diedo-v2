import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  PencilLine,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useActiveBranchScope } from '@/hooks/useActiveBranchScope'
import { useSessionStore } from '@/stores/sessionStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { appointmentsApi } from '@/services/appointmentsApi'
import { usersApi } from '@/services/usersApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { TimePicker } from '@/components/ui/TimePicker'
import { cn } from '@/lib/utils'
import { WEEKDAY_KEYS, WEEKDAY_LABELS } from '@/modules/rrhh/lib/schedule'
import {
  ACL_LABELS,
  accessPillClass,
  accessRowHighlightClass,
  aclPatchItems,
  aclRowsToMap,
  cycleResourceAccess,
  fetchAllActiveUsers,
  normalizeAclUserId,
  platformUserId,
  sortResources,
  userAssignedToBranch,
} from '../lib/agendaCabinas'
import { configPageClass } from '../lib/pageShell'
import { isSettingsBlockVisible } from '../lib/settingsSearch'

const TABS = [
  { id: 'order', label: 'Orden de Cabinas' },
  { id: 'hours', label: 'Horarios Laborales' },
  { id: 'acl', label: 'Permisos de Usuarios' },
  { id: 'staff', label: 'Personal de Agenda' },
]

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function roleLabel(user) {
  const name = user.role?.name || user.roleAssignments?.[0]?.roleName || ''
  return name ? String(name).toLowerCase() : ''
}

function AccessPill({ access }) {
  const level = access || 'none'
  const label = ACL_LABELS[level] || ACL_LABELS.none
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]', accessPillClass(access))}>
      {access === 'use' && <CheckCircle2 className="h-3 w-3" aria-hidden />}
      {access === 'view' && <Clock className="h-3 w-3" aria-hidden />}
      {access === 'edit' && <PencilLine className="h-3 w-3" aria-hidden />}
      {label}
    </span>
  )
}

export default function AgendaCabinasPanel({ embedded = false, visibleBlockIds }) {
  const online = useSessionStore((state) => state.status === 'online')
  const canManage = useSessionStore((state) => state.hasPermission('appointment.manage'))
  const canReadUsers = useSessionStore((state) => state.hasPermission('membership.read'))
  const { activeBranchId, setActiveBranch, branches, selectOptions } = useActiveBranchScope()
  const hydrateEmployees = useRrhhStore((state) => state.hydrateEmployees)
  const employees = useRrhhStore((state) => state.employees)
  const addEmployee = useRrhhStore((state) => state.addEmployee)
  const updateEmployee = useRrhhStore((state) => state.updateEmployee)
  const deleteEmployee = useRrhhStore((state) => state.deleteEmployee)

  const [tab, setTab] = useState('order')
  const [resources, setResources] = useState([])
  const [openingHours, setOpeningHours] = useState([])
  const [users, setUsers] = useState([])
  const [usersLoadError, setUsersLoadError] = useState('')
  const [aclByResource, setAclByResource] = useState({})
  const [aclLoading, setAclLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const aclLoadSeq = useRef(0)
  const aclMutationSeq = useRef(0)

  const [cabinaModal, setCabinaModal] = useState(null)
  const [dayModalOpen, setDayModalOpen] = useState(false)
  const [dayForm, setDayForm] = useState({ weekday: 'mon', opensAt: '08:00', closesAt: '20:00' })
  const [staffModal, setStaffModal] = useState(null)

  useEffect(() => {
    if (!visibleBlockIds?.length) return
    if (visibleBlockIds.includes('hours')) setTab('hours')
    else if (visibleBlockIds.includes('acl')) setTab('acl')
    else if (visibleBlockIds.includes('staff')) setTab('staff')
    else if (visibleBlockIds.includes('order') || visibleBlockIds.includes('distribution')) setTab('order')
  }, [visibleBlockIds])

  const sortedResources = useMemo(() => sortResources(resources), [resources])
  const tabAllowed = (tabId) => {
    if (!visibleBlockIds?.length) return true
    if (tabId === 'order') return visibleBlockIds.includes('order') || visibleBlockIds.includes('distribution')
    return visibleBlockIds.includes(tabId)
  }
  const branchEmployees = useMemo(
    () => employees.filter(
      (employee) => employee.status !== 'archived'
        && (employee.branchIds || []).includes(activeBranchId),
    ),
    [employees, activeBranchId],
  )

  const loadResources = useCallback(async () => {
    if (!online || !activeBranchId) return []
    const items = await appointmentsApi.appointmentResources({
      branchId: activeBranchId,
      forConfig: true,
    })
    setResources(items)
    return items
  }, [activeBranchId, online])

  const loadHours = useCallback(async () => {
    if (!online || !activeBranchId) return
    setOpeningHours(await appointmentsApi.branchOpeningHours(activeBranchId))
  }, [activeBranchId, online])

  const loadUsers = useCallback(async () => {
    if (!online) {
      setUsers([])
      setUsersLoadError('')
      return
    }
    if (!canReadUsers) {
      setUsers([])
      setUsersLoadError('membership')
      return
    }
    try {
      const items = await fetchAllActiveUsers(usersApi)
      setUsers(items)
      setUsersLoadError('')
    } catch (error) {
      setUsers([])
      setUsersLoadError(error.message || 'users')
      throw error
    }
  }, [canReadUsers, online])

  const loadAllAcl = useCallback(async (resourceList) => {
    const resourcesForAcl = sortResources(resourceList || [])
    if (!online || !activeBranchId || resourcesForAcl.length === 0) {
      setAclByResource({})
      return
    }
    const seq = aclLoadSeq.current + 1
    aclLoadSeq.current = seq
    const mutationAtStart = aclMutationSeq.current
    setAclLoading(true)
    try {
      const pairs = await Promise.all(
        resourcesForAcl.map(async (resource) => {
          const items = await appointmentsApi.appointmentResourceAcl(resource.id, activeBranchId)
          return [resource.id, aclRowsToMap(items)]
        }),
      )
      if (seq !== aclLoadSeq.current || aclMutationSeq.current !== mutationAtStart) return
      const next = {}
      pairs.forEach(([resourceId, byUser]) => {
        next[resourceId] = byUser
      })
      setAclByResource(next)
    } catch (error) {
      toast.error(error.message || 'No se pudieron cargar los permisos de cabinas.')
    } finally {
      if (seq === aclLoadSeq.current) setAclLoading(false)
    }
  }, [activeBranchId, online])

  useEffect(() => {
    if (!activeBranchId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [loadedResources] = await Promise.all([
          online ? loadResources() : Promise.resolve([]),
          online ? loadHours() : Promise.resolve(),
        ])
        if (cancelled) return
        if (online) await loadAllAcl(loadedResources || [])
        if (cancelled) return
        await hydrateEmployees({ force: false }).catch(() => {})
      } catch (error) {
        if (!cancelled) {
          toast.error(error.message || 'No se pudo cargar la configuración de agenda.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
      if (cancelled) return
      try {
        await loadUsers()
      } catch {
        if (!cancelled) toast.error('No se pudieron cargar los usuarios del sistema.')
      }
    }
    run().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeBranchId, online, canReadUsers, hydrateEmployees, loadAllAcl, loadHours, loadResources, loadUsers])

  const branchUsers = useMemo(
    () => users.filter((user) => userAssignedToBranch(user, activeBranchId)),
    [users, activeBranchId],
  )

  const moveResource = async (index, direction) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= sortedResources.length) return
    const ids = sortedResources.map((item) => item.id)
    const [removed] = ids.splice(index, 1)
    ids.splice(nextIndex, 0, removed)
    try {
      const reordered = await appointmentsApi.reorderAppointmentResources({
        branchId: activeBranchId,
        resourceIds: ids,
      })
      setResources(reordered)
    } catch (error) {
      toast.error(error.message || 'No se pudo reordenar.')
    }
  }

  const saveCabina = async () => {
    if (!cabinaModal?.name?.trim()) {
      toast.error('El nombre es obligatorio.')
      return
    }
    try {
      if (cabinaModal.id) {
        const updated = await appointmentsApi.updateAppointmentResource(
          cabinaModal.id,
          activeBranchId,
          { name: cabinaModal.name.trim(), description: cabinaModal.description?.trim() || null, version: cabinaModal.version },
        )
        setResources((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      } else {
        const created = await appointmentsApi.createAppointmentResource({
          branchId: activeBranchId,
          name: cabinaModal.name.trim(),
          description: cabinaModal.description?.trim() || null,
        })
        setResources((current) => [...current, created])
      }
      setCabinaModal(null)
      toast.success('Cabina guardada')
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar la cabina.')
    }
  }

  const removeCabina = async (resource) => {
    if (!window.confirm(`¿Archivar ${resource.name}?`)) return
    try {
      await appointmentsApi.deleteAppointmentResource(resource.id, activeBranchId, resource.version)
      setResources((current) => current.filter((item) => item.id !== resource.id))
      toast.success('Cabina archivada')
    } catch (error) {
      toast.error(error.message || 'No se pudo archivar.')
    }
  }

  const addDay = async () => {
    if (openingHours.some((row) => row.weekday === dayForm.weekday)) {
      toast.error('Ese día ya está configurado.')
      return
    }
    const items = [...openingHours, dayForm]
    try {
      setOpeningHours(await appointmentsApi.replaceBranchOpeningHours(activeBranchId, items))
      setDayModalOpen(false)
      toast.success('Día agregado')
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar el horario.')
    }
  }

  const removeDay = async (weekday) => {
    const items = openingHours.filter((row) => row.weekday !== weekday)
    try {
      setOpeningHours(await appointmentsApi.replaceBranchOpeningHours(activeBranchId, items))
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar el día.')
    }
  }

  const toggleAcl = async (resourceId, userId) => {
    const normalizedUserId = normalizeAclUserId(userId)
    const currentMap = aclByResource[resourceId] || {}
    const current = currentMap[normalizedUserId] ?? null
    const next = cycleResourceAccess(current)
    const mutationSeq = aclMutationSeq.current + 1
    aclMutationSeq.current = mutationSeq

    setAclByResource((state) => {
      const map = { ...(state[resourceId] || {}) }
      if (next == null) delete map[normalizedUserId]
      else map[normalizedUserId] = next
      return { ...state, [resourceId]: map }
    })

    const items = aclPatchItems(userId, next)
    try {
      const saved = await appointmentsApi.replaceAppointmentResourceAcl(resourceId, activeBranchId, items)
      if (mutationSeq < aclMutationSeq.current) return
      setAclByResource((state) => ({
        ...state,
        [resourceId]: aclRowsToMap(saved),
      }))
    } catch (error) {
      aclMutationSeq.current += 1
      setAclByResource((state) => ({
        ...state,
        [resourceId]: { ...(state[resourceId] || {}), [normalizedUserId]: current },
      }))
      toast.error(error.message || 'No se pudo actualizar permisos.')
    }
  }

  const saveStaff = async () => {
    if (!staffModal?.name?.trim()) {
      toast.error('El nombre es obligatorio.')
      return
    }
    try {
      if (staffModal.id) {
        await updateEmployee(staffModal.id, {
          name: staffModal.name.trim(),
          position: staffModal.position?.trim() || 'Especialista',
        })
      } else {
        await addEmployee({
          name: staffModal.name.trim(),
          position: staffModal.position?.trim() || 'Especialista',
          branchIds: [activeBranchId],
          selectableAsSpecialist: true,
        })
      }
      setStaffModal(null)
      await hydrateEmployees({ force: true })
      toast.success('Personal guardado')
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar el especialista.')
    }
  }

  const archiveStaff = async (employee) => {
    if (!window.confirm(`¿Archivar a ${employee.name}?`)) return
    try {
      await deleteEmployee(employee.id)
      await hydrateEmployees({ force: true })
      toast.success('Empleado archivado')
    } catch (error) {
      toast.error(error.message || 'No se pudo archivar.')
    }
  }

  if (!canManage) {
    return (
      <div className={configPageClass(embedded, 'max-w-5xl')} data-testid="agenda-cabinas-panel">
        <p className="text-sm text-slate-500">Necesitas permiso de gestión de agenda para configurar cabinas.</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', embedded ? 'pt-2' : configPageClass(false, 'max-w-5xl'))} data-testid="agenda-cabinas-panel">
      {!embedded && (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-bold text-slate-900">Agenda y Cabinas</h3>
            <p className="text-sm text-slate-500">Horarios, cabinas y permisos por sucursal.</p>
          </div>
        </div>
      )}

      {isSettingsBlockVisible(visibleBlockIds, 'branch') && (
      <Card className="flex flex-wrap items-center justify-between gap-4 border-slate-100 bg-slate-50/80 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sucursal activa</p>
            <Select
              value={activeBranchId || ''}
              onChange={setActiveBranch}
              options={selectOptions}
              className="min-w-[220px] border-0 bg-transparent p-0 text-lg font-bold text-slate-900 shadow-none"
            />
          </div>
        </div>
        {loading && <p className="text-sm text-slate-500" role="status">Cargando…</p>}
      </Card>
      )}

      {(isSettingsBlockVisible(visibleBlockIds, 'order')
        || isSettingsBlockVisible(visibleBlockIds, 'distribution')
        || isSettingsBlockVisible(visibleBlockIds, 'hours')
        || isSettingsBlockVisible(visibleBlockIds, 'acl')
        || isSettingsBlockVisible(visibleBlockIds, 'staff')) && (
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.filter((item) => {
          if (!visibleBlockIds?.length) return true
          if (item.id === 'order') return visibleBlockIds.includes('order') || visibleBlockIds.includes('distribution')
          return visibleBlockIds.includes(item.id)
        }).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-white/60',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      )}

      {tab === 'order' && tabAllowed('order') && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-soft">
            <div>
              <h4 className="font-heading text-lg font-bold text-slate-900">Distribución física</h4>
              <p className="text-sm text-slate-500">Usa las flechas para cambiar el orden en el calendario.</p>
            </div>
            <Button onClick={() => setCabinaModal({ name: '', description: '' })} data-testid="agenda-new-cabina">
              <Plus className="mr-2 h-4 w-4" /> Nueva cabina
            </Button>
          </div>
          <div className="space-y-2">
            {sortedResources.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                Esta sucursal no tiene cabinas. Agrega la primera con el botón superior.
              </p>
            ) : sortedResources.map((resource, index) => (
              <div
                key={resource.id}
                className="group flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-soft"
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col text-slate-400">
                    <button type="button" disabled={index === 0} onClick={() => moveResource(index, -1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={index === sortedResources.length - 1} onClick={() => moveResource(index, 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{resource.name}</p>
                    <p className="text-sm text-slate-500">{resource.description || 'Sin descripción'}</p>
                  </div>
                </div>
                <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <Button variant="ghost" size="sm" onClick={() => setCabinaModal({ ...resource })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => removeCabina(resource)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'hours' && tabAllowed('hours') && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setDayModalOpen(true)} data-testid="agenda-add-day">
              <Plus className="mr-2 h-4 w-4" /> Agregar día
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {WEEKDAY_KEYS.map((weekday) => {
              const row = openingHours.find((item) => item.weekday === weekday)
              return (
                <Card key={weekday} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{WEEKDAY_LABELS[weekday]}</p>
                      <p className="text-sm text-slate-500">
                        {row ? `${row.opensAt} – ${row.closesAt}` : 'Sin horario (día cerrado en calendario)'}
                      </p>
                    </div>
                    {row && (
                      <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => removeDay(weekday)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'acl' && tabAllowed('acl') && (
        <div className="space-y-4" data-testid="agenda-acl-panel">
          <Card className="border-slate-100 p-4 shadow-soft">
            <h4 className="font-heading text-lg font-bold text-slate-900">Asignación de Usuarios de Sistema</h4>
            <p className="mt-1 text-sm text-slate-500">
              Otorga el permiso a los usuarios del sistema (ej. recepcionistas) para ver y administrar la agenda de estas cabinas.
              Sin usuarios asignados, la cabina queda abierta a todos.
            </p>
          </Card>

          {usersLoadError === 'membership' && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Necesitas permiso para ver usuarios (membership.read) para asignar accesos por cabina.
            </p>
          )}

          {usersLoadError && usersLoadError !== 'membership' && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              No se pudieron cargar los usuarios del sistema.
            </p>
          )}

          {aclLoading && (
            <p className="text-sm text-slate-500" role="status">Cargando permisos…</p>
          )}

          {sortedResources.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              Esta sucursal no tiene cabinas. Agrega cabinas en la pestaña Orden de Cabinas.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {sortedResources.map((resource) => (
                <div
                  key={resource.id}
                  className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft"
                  data-testid={`agenda-acl-card-${resource.id}`}
                >
                  <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                    <h5 className="flex items-center gap-2 font-bold text-slate-900">
                      <Building2 className="h-4 w-4 text-blue-600" aria-hidden />
                      {resource.name}
                    </h5>
                  </div>
                  <div className="max-h-80 space-y-1 overflow-y-auto p-2">
                    <div className="flex justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <span>Usuario</span>
                      <span>Nivel de Acceso</span>
                    </div>
                    {branchUsers.length === 0 ? (
                      <p className="px-2 py-4 text-center text-sm text-slate-500">
                        No hay usuarios activos con acceso a esta sucursal.
                      </p>
                    ) : branchUsers.map((user) => {
                      const access = aclByResource[resource.id]?.[normalizeAclUserId(platformUserId(user))] ?? null
                      const highlighted = access === 'use' || access === 'edit'
                      return (
                        <button
                          key={`${resource.id}-${user.userId}`}
                          type="button"
                          onClick={() => toggleAcl(resource.id, platformUserId(user))}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg p-2 text-left text-sm transition-colors',
                            accessRowHighlightClass(access),
                          )}
                        >
                          <div className="min-w-0 pr-2">
                            <span className={cn('block truncate font-medium', highlighted ? 'font-bold text-blue-700' : 'text-slate-600')}>
                              {user.displayName}
                            </span>
                            {roleLabel(user) && (
                              <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] capitalize text-slate-500">
                                {roleLabel(user)}
                              </span>
                            )}
                          </div>
                          <AccessPill access={access} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'staff' && tabAllowed('staff') && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setStaffModal({ name: '', position: 'Especialista' })}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo especialista
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branchEmployees.map((employee) => (
              <Card key={employee.id} className="flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-700">
                  {initials(employee.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{employee.name}</p>
                  <p className="truncate text-sm text-slate-500">{employee.position || 'Especialista'}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setStaffModal({ id: employee.id, name: employee.name, position: employee.position })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => archiveStaff(employee)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal open={Boolean(cabinaModal)} onClose={() => setCabinaModal(null)} title={cabinaModal?.id ? 'Editar cabina' : 'Nueva cabina'}>
        <div className="space-y-4 pt-2">
          <Input label="Nombre de área / cabina" value={cabinaModal?.name || ''} onChange={(event) => setCabinaModal((current) => ({ ...current, name: event.target.value }))} />
          <Input label="Descripción (opcional)" value={cabinaModal?.description || ''} onChange={(event) => setCabinaModal((current) => ({ ...current, description: event.target.value }))} />
          <Button className="w-full" onClick={saveCabina}>Guardar</Button>
        </div>
      </Modal>

      <Modal open={dayModalOpen} onClose={() => setDayModalOpen(false)} title="Agregar día">
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Día</p>
            <Select
              value={dayForm.weekday}
              onChange={(value) => setDayForm((current) => ({ ...current, weekday: value }))}
              options={WEEKDAY_KEYS.map((weekday) => ({ value: weekday, label: WEEKDAY_LABELS[weekday] }))}
            />
          </div>
          <TimePicker label="Desde" value={dayForm.opensAt} onChange={(value) => setDayForm((current) => ({ ...current, opensAt: value }))} />
          <TimePicker label="Hasta" value={dayForm.closesAt} onChange={(value) => setDayForm((current) => ({ ...current, closesAt: value }))} />
          <Button className="w-full" onClick={addDay}>Guardar</Button>
        </div>
      </Modal>

      <Modal open={Boolean(staffModal)} onClose={() => setStaffModal(null)} title={staffModal?.id ? 'Editar especialista' : 'Nuevo especialista'}>
        <div className="space-y-4 pt-2">
          <Input label="Nombre" value={staffModal?.name || ''} onChange={(event) => setStaffModal((current) => ({ ...current, name: event.target.value }))} />
          <Input label="Cargo" value={staffModal?.position || ''} onChange={(event) => setStaffModal((current) => ({ ...current, position: event.target.value }))} />
          <Button className="w-full" onClick={saveStaff}>Guardar</Button>
        </div>
      </Modal>
    </div>
  )
}
