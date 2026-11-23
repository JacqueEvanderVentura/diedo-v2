export function openNotificationLink({ notification, navigate, setIncidenciaId }) {
  const link = notification?.link || {}
  const incidentId = link.incidentId || link.incidenciaId
  const purchaseId = link.purchaseRequestId
  const appointmentId = link.appointmentId

  if (incidentId && setIncidenciaId) setIncidenciaId(incidentId)

  if (link.path) {
    const path = link.path
    if (purchaseId) {
      navigate(`${path}?solicitud=${purchaseId}`)
      return
    }
    if (appointmentId) {
      navigate(`${path}?cita=${appointmentId}`)
      return
    }
    navigate(path)
    return
  }

  if (incidentId) navigate('/incidencias')
}