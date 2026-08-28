import { usePosStore } from '@/stores/posStore'

export function agendaReceivableId(appointmentId) {
  return `cxc-agenda-${appointmentId}`
}

export function syncAppointmentReceivable(appointment) {
  if (!appointment?.id) return
  usePosStore.getState().syncAppointmentReceivable(appointment)
}

export function removeAppointmentReceivable(appointmentId) {
  if (!appointmentId) return
  usePosStore.getState().removeAppointmentReceivable(appointmentId)
}

export function syncAllAgendaReceivables(appointments = []) {
  appointments.forEach((apt) => {
    if (apt.pendingPayment && Number(apt.pendingAmount) > 0) {
      syncAppointmentReceivable(apt)
    }
  })
}

export function notifyAgendaReceivablePaid(appointmentId) {
  if (!appointmentId) return
  import('@/stores/agendaStore').then(({ useAgendaStore }) => {
    const apt = useAgendaStore.getState().appointments.find((a) => a.id === appointmentId)
    if (!apt?.pendingPayment) return
    useAgendaStore.getState().updateAppointment(appointmentId, {
      pendingPayment: false,
      pendingAmount: 0,
    })
  })
}
