export const APPOINTMENT_RECEIVABLE_PERMISSION_NOTE = 'Necesitas permiso para gestionar CxC y cambiar el saldo pendiente.'
export const APPOINTMENT_CANCEL_RECEIVABLE_NOTE = 'Requiere permiso de CxC para cancelar una cita con saldo pendiente.'
export const APPOINTMENT_DELETE_RECEIVABLE_NOTE = 'Requiere permiso de CxC para eliminar una cita con saldo pendiente.'

export function appointmentHasPendingReceivable(appointment) {
  return appointment?.pendingPayment === true && Number(appointment.pendingAmount) > 0
}

export function getAppointmentReceivablePolicy({ appointment, online, canManageReceivables }) {
  const canManagePending = !online || canManageReceivables
  const cancellationNeedsPermission = online && appointmentHasPendingReceivable(appointment)
  const canCancel = !cancellationNeedsPermission || canManageReceivables
  const canDelete = !cancellationNeedsPermission || canManageReceivables

  return {
    canManagePending,
    canCancel,
    cancelReason: canCancel ? null : APPOINTMENT_CANCEL_RECEIVABLE_NOTE,
    canDelete,
    deleteReason: canDelete ? null : APPOINTMENT_DELETE_RECEIVABLE_NOTE,
  }
}
