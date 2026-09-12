import { describe, expect, it } from 'vitest'
import { buildEmployeeKpis, computeEmployeeKpiScore, computePunctualityStats } from '@/modules/reportes/lib/personalKpi'

describe('personalKpi', () => {
  it('calcula puntualidad desde citas cumplidas', () => {
    const stats = computePunctualityStats([
      { status: 'cumplida', completionPunctuality: 'on_time' },
      { status: 'cumplida', completionPunctuality: 'delayed' },
      { status: 'confirmada' },
    ])
    expect(stats).toMatchObject({ attended: 2, onTime: 1, delayed: 1, rate: 50 })
  })

  it('penaliza sobreuso de insumos en el score', () => {
    const balanced = computeEmployeeKpiScore({
      appointmentsAttended: 10,
      teamAverageAttended: 10,
      punctualityRate: 100,
      incidentCount: 0,
      supplyVariance: 0,
      expectedSupply: 10,
    })
    const overuse = computeEmployeeKpiScore({
      appointmentsAttended: 10,
      teamAverageAttended: 10,
      punctualityRate: 100,
      incidentCount: 0,
      supplyVariance: 5,
      expectedSupply: 10,
    })
    expect(overuse).toBeLessThan(balanced)
  })

  it('arma ranking por empleado', () => {
    const rows = buildEmployeeKpis({
      appointments: [
        { employeeId: 'emp-1', status: 'cumplida', completionPunctuality: 'on_time', serviceId: 'p2' },
        { employeeId: 'emp-1', status: 'cumplida', completionPunctuality: 'on_time', serviceId: 'p2' },
      ],
      employees: [{ id: 'emp-1', firstName: 'Ana', lastName: 'Vargas', position: 'Estilista' }],
      incidentMetrics: [],
      supplyUsage: [{
        employeeId: 'emp-1',
        qty: 3,
        expectedQty: 2,
        variance: 1,
      }],
      teamAverageAttended: 2,
    })
    expect(rows[0]).toMatchObject({
      employeeId: 'emp-1',
      appointmentsAttended: 2,
      supplyVariance: 1,
      expectedSupply: 2,
    })
  })
})
