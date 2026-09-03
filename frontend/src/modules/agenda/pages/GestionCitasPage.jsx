import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, Share2, CalendarDays } from 'lucide-react'
import { useAgendaStore, statusMeta, APPOINTMENT_STATUSES } from '@/stores/agendaStore'
import { useConfigStore } from '@/stores/configStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { staffOptionsForBranch, allStaffOptions, resolveStaffName } from '@/modules/rrhh/lib/staff'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { AppointmentFormModal } from '../components/AppointmentFormModal'
import { AppointmentShareModal } from '../components/AppointmentShareModal'
import { DeleteAppointmentModal } from '../components/DeleteAppointmentModal'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import { formatShortDate, endTime } from '../lib/calendar'
import { isProximoAppointment } from '../lib/appointments'
import { ResponsiveList, ResponsiveTable, ResponsiveCards } from '@/components/ui/ResponsiveList'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { DataSourceNotice } from '@/components/ui/DataSourceNotice'
import { useAgendaPolling } from '../hooks/useAgendaPolling'
import { useSessionStore } from '@/stores/sessionStore'
import { getAppointmentReceivablePolicy } from '../lib/receivablePermissions'

function AppointmentStatusControl({ apt, canManage, changing, onChange, online, canManageReceivables }) {
  const currentStatus = statusMeta(apt.status)
  const proximo = isProximoAppointment(apt)
  const receivablePolicy = getAppointmentReceivablePolicy({ appointment: apt, online, canManageReceivables })
  const options = APPOINTMENT_STATUSES.map((status) => ({
    value: status.id,
    label: status.name,
    disabled: status.id === 'cancelada' && !receivablePolicy.canCancel,
  }))

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage ? (
        <Select
          value={apt.status}
          onChange={(nextStatus) => nextStatus !== apt.status && onChange(apt, nextStatus)}
          options={options}
          size="sm"
          variant="muted"
          disabled={changing}
          className="w-36"
          menuMinWidth={160}
          data-testid={`gestion-status-${apt.id}`}
        />
      ) : (
        <Badge tone={currentStatus.tone}>{currentStatus.name}</Badge>
      )}
      {proximo && <Badge tone="warning">Próximo</Badge>}
    </div>
  )
}

function ActionButtons({ apt, onEdit, onDelete, onShare, canManage, canDelete, online, canManageReceivables }) {
  const deletion = getAppointmentReceivablePolicy({ appointment: apt, online, canManageReceivables })
  return (
    <div className="flex items-center justify-end gap-1">
      <WhatsAppMenuButton
        phone={apt.customerPhone}
        context="agenda"
        size="sm"
        variables={{
          nombre_cliente: apt.customerName || '',
          fecha: formatShortDate(apt.date),
          hora: apt.time || '',
          servicio: apt.serviceName || '',
        }}
        data-testid={`gestion-wa-${apt.id}`}
      />
      <button
        type="button"
        onClick={() => onShare(apt)}
        title="Compartir"
        data-testid={`gestion-share-${apt.id}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-600"
      >
        <Share2 className="h-4 w-4" />
      </button>
      {canManage && (
        <button
          type="button"
          onClick={() => onEdit(apt)}
          title="Editar"
          aria-label="Editar cita"
          data-testid={`gestion-edit-${apt.id}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {canDelete && (
        <span title={deletion.deleteReason || 'Eliminar'}>
          <button
            type="button"
            onClick={() => onDelete(apt)}
            disabled={!deletion.canDelete}
            aria-label={deletion.deleteReason || 'Eliminar cita'}
            data-testid={`gestion-delete-${apt.id}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </span>
      )}
    </div>
  )
}

function AppointmentMobileCard({ apt, branchName, staffName, onEdit, onDelete, onShare, onStatusChange, canManage, canDelete, statusChanging, online, canManageReceivables }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-soft" data-testid={`gestion-card-${apt.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{apt.customerName}</p>
          <p className="mt-0.5 truncate text-sm text-slate-500">{apt.serviceName || '—'}</p>
        </div>
        <AppointmentStatusControl
          apt={apt}
          canManage={canManage}
          changing={statusChanging}
          onChange={onStatusChange}
          online={online}
          canManageReceivables={canManageReceivables}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div>
          <p className="font-medium uppercase tracking-wide text-slate-400">Fecha</p>
          <p className="mt-0.5 capitalize text-slate-700">{formatShortDate(apt.date)}</p>
        </div>
        <div>
          <p className="font-medium uppercase tracking-wide text-slate-400">Hora</p>
          <p className="mt-0.5 text-slate-700">{apt.time} – {endTime(apt.time, apt.duration)}</p>
        </div>
        <div>
          <p className="font-medium uppercase tracking-wide text-slate-400">Empleado</p>
          <p className="mt-0.5 text-slate-700">{staffName(apt.employeeId)}</p>
        </div>
        <div>
          <p className="font-medium uppercase tracking-wide text-slate-400">Sucursal</p>
          <p className="mt-0.5 text-slate-700">{branchName}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end border-t border-slate-50 pt-3">
        <ActionButtons apt={apt} onEdit={onEdit} onDelete={onDelete} onShare={onShare} canManage={canManage} canDelete={canDelete} online={online} canManageReceivables={canManageReceivables} />
      </div>
    </div>
  )
}

export default function GestionCitasPage() {
  const appointments = useAgendaStore((s) => s.appointments)
  const deleteAppointment = useAgendaStore((s) => s.deleteAppointment)
  const setAppointmentStatus = useAgendaStore((s) => s.setStatus)
  const dataState = useAgendaStore((s) => s.dataState)
  const hydrateAppointments = useAgendaStore((s) => s.hydrateAppointments)
  const rrhhEmployees = useRrhhStore((s) => s.employees)
  const branches = useConfigStore((s) => s.branches)
  const canManage = useSessionStore((s) => s.hasPermission('appointment.manage'))
  const canDelete = useSessionStore((s) => s.hasPermission('appointment.delete'))
  const canManageReceivables = useSessionStore((s) => s.hasPermission('pos.receivables.manage'))
  const online = useSessionStore((s) => s.status === 'online')

  const [search, setSearch] = useState('')
  const [employeeId, setEmployeeId] = useState('all')
  const [branchId, setBranchId] = useState('all')
  const [status, setStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [shareTarget, setShareTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

  const appointmentQuery = useMemo(
    () => branchId === 'all' ? {} : { branchId },
    [branchId]
  )
  useAgendaPolling(appointmentQuery)

  const staffName = (id) => resolveStaffName(id, rrhhEmployees)

  const employeeOptions = useMemo(() => {
    if (branchId === 'all') {
      const all = allStaffOptions(rrhhEmployees)
      return [{ value: 'all', label: 'Todos los empleados' }, ...all.map((e) => ({ value: e.id, label: e.name }))]
    }
    const branchStaff = staffOptionsForBranch(rrhhEmployees, branchId)
    return [{ value: 'all', label: 'Todos los empleados' }, ...branchStaff.map((e) => ({ value: e.id, label: e.name }))]
  }, [rrhhEmployees, branchId])

  const branchMap = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return appointments
      .filter((a) => employeeId === 'all' || a.employeeId === employeeId)
      .filter((a) => branchId === 'all' || a.branchId === branchId)
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => {
        if (!q) return true
        return (
          a.customerName.toLowerCase().includes(q) ||
          (a.serviceName || '').toLowerCase().includes(q) ||
          (a.customerPhone || '').includes(q)
        )
      })
  }, [appointments, search, employeeId, branchId, status])

  const { rows: displayRows, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'date', dir: 'desc' },
    accessors: {
      customer: (a) => a.customerName || '',
      date: (a) => a.date || '',
      time: (a) => a.time || '',
      employee: (a) => staffName(a.employeeId),
      branch: (a) => branchMap[a.branchId] || '',
      status: (a) => a.status || '',
    },
  })

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (apt) => {
    setEditing(apt)
    setModalOpen(true)
  }

  const requestDelete = (apt) => {
    const deletion = getAppointmentReceivablePolicy({ appointment: apt, online, canManageReceivables })
    if (!deletion.canDelete) {
      toast.info(deletion.deleteReason)
      return
    }
    setDeleteTarget(apt)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteAppointment(deleteTarget.id)
      setDeleteTarget(null)
      toast.success('Cita eliminada')
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar la cita')
    } finally {
      setDeleting(false)
    }
  }

  const changeStatus = async (apt, nextStatus) => {
    if (statusUpdatingId) return
    const receivablePolicy = getAppointmentReceivablePolicy({
      appointment: apt,
      online,
      canManageReceivables,
    })
    if (nextStatus === 'cancelada' && !receivablePolicy.canCancel) {
      toast.info(receivablePolicy.cancelReason)
      return
    }
    setStatusUpdatingId(apt.id)
    try {
      await setAppointmentStatus(apt.id, nextStatus)
      toast.success('Estado de la cita actualizado')
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar el estado')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="gestion-citas-page">
      <DataSourceNotice
        state={dataState}
        onRetry={() => hydrateAppointments({ force: true, params: appointmentQuery })}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">Gestión de citas</h1>
          <p className="mt-1 text-sm text-slate-500">{displayRows.length} cita{displayRows.length !== 1 ? 's' : ''} en el listado</p>
        </div>
        <Button onClick={openNew} disabled={!canManage} data-testid="gestion-new">
          <Plus className="h-4 w-4" /> Nueva cita
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente o servicio..."
            data-testid="gestion-search"
            className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>
        <Select
          value={employeeId}
          onChange={setEmployeeId}
          placeholder="Empleado"
          options={employeeOptions}
          data-testid="gestion-filter-employee"
        />
        <Select
          value={branchId}
          onChange={setBranchId}
          placeholder="Sucursal"
          options={[{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]}
          data-testid="gestion-filter-branch"
        />
        <Select
          value={status}
          onChange={setStatus}
          placeholder="Estado"
          options={[{ value: 'all', label: 'Todos los estados' }, ...APPOINTMENT_STATUSES.map((s) => ({ value: s.id, label: s.name }))]}
          data-testid="gestion-filter-status"
        />
      </div>

      {displayRows.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Sin citas" description="No hay citas con esos filtros." className="py-14" />
      ) : (
        <ResponsiveList minTableWidth={840} columnCount={7}>
          <ResponsiveTable testId="gestion-table">
              <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <SortableTh column="customer" className="px-6 py-4">Cliente / Servicio</SortableTh>
                    <SortableTh column="date" className="px-6 py-4">Fecha</SortableTh>
                    <SortableTh column="time" className="px-6 py-4">Hora</SortableTh>
                    <SortableTh column="employee" className="px-6 py-4">Empleado</SortableTh>
                    <SortableTh column="branch" className="px-6 py-4">Sucursal</SortableTh>
                    <SortableTh column="status" className="px-6 py-4">Estado</SortableTh>
                    <SortableTh sortable={false} align="right" className="px-6 py-4">Acciones</SortableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayRows.map((apt) => {
                    return (
                      <tr key={apt.id} className="transition-colors hover:bg-slate-50/60" data-testid={`gestion-row-${apt.id}`}>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-800">{apt.customerName}</p>
                          <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">{apt.serviceName || '—'}</p>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 capitalize text-slate-600">{formatShortDate(apt.date)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                          {apt.time} – {endTime(apt.time, apt.duration)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">{staffName(apt.employeeId)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">{branchMap[apt.branchId] || '—'}</td>
                        <td className="px-6 py-4">
                          <AppointmentStatusControl
                            apt={apt}
                            canManage={canManage}
                            changing={statusUpdatingId === apt.id}
                            onChange={changeStatus}
                            online={online}
                            canManageReceivables={canManageReceivables}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <ActionButtons apt={apt} onEdit={openEdit} onDelete={requestDelete} onShare={setShareTarget} canManage={canManage} canDelete={canDelete} online={online} canManageReceivables={canManageReceivables} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </SortableTableProvider>
          </ResponsiveTable>

          <ResponsiveCards testId="gestion-cards">
            {displayRows.map((apt) => (
              <AppointmentMobileCard
                key={apt.id}
                apt={apt}
                branchName={branchMap[apt.branchId] || '—'}
                staffName={staffName}
                onEdit={openEdit}
                onDelete={requestDelete}
                onShare={setShareTarget}
                onStatusChange={changeStatus}
                canManage={canManage}
                canDelete={canDelete}
                statusChanging={statusUpdatingId === apt.id}
                online={online}
                canManageReceivables={canManageReceivables}
              />
            ))}
          </ResponsiveCards>
        </ResponsiveList>
      )}

      <AppointmentFormModal open={modalOpen} onClose={() => setModalOpen(false)} appointment={editing} />
      <AppointmentShareModal open={!!shareTarget} onClose={() => setShareTarget(null)} appointment={shareTarget} />
      <DeleteAppointmentModal
        appointment={deleteTarget}
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
