const ATTENDED_STATUSES = new Set(['cumplida', 'completada', 'asistio'])

export function normalizeSupplyBom(bom = []) {
  return (bom || [])
    .map((line) => ({
      supplyId: line.supplyId || line.supply_id || line.id,
      qty: Number(line.qty ?? line.quantity) || 0,
    }))
    .filter((line) => line.supplyId && line.qty > 0)
}

export function serviceBomMap(services = []) {
  const map = new Map()
  services
    .filter((service) => service.type === 'service')
    .forEach((service) => {
      const bom = normalizeSupplyBom(service.supplyBom)
      if (bom.length) map.set(service.id, bom)
    })
  return map
}

export function computeExpectedSupplyUsage({ appointments = [], services = [] }) {
  const bomByService = serviceBomMap(services)
  const expected = {}

  appointments
    .filter((appointment) => appointment.employeeId && ATTENDED_STATUSES.has(appointment.status))
    .forEach((appointment) => {
      const serviceId = appointment.serviceId
      const bom = bomByService.get(serviceId)
      if (!bom?.length) return
      bom.forEach((line) => {
        const key = `${appointment.employeeId}:${line.supplyId}`
        if (!expected[key]) {
          expected[key] = {
            employeeId: appointment.employeeId,
            supplyId: line.supplyId,
            expectedQty: 0,
            appointmentsCount: 0,
          }
        }
        expected[key].expectedQty += line.qty
        expected[key].appointmentsCount += 1
      })
    })

  return expected
}
